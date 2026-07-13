import logging
from typing import List, Dict, Any

logger = logging.getLogger("ContraMesh.graph_db")

# Optional neo4j driver import
try:
    from neo4j import GraphDatabase
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False
    logger.warning("neo4j driver not installed. Memgraph connector will fall back to InMemoryGraphConnector.")

class GraphConnector:
    """Base interface for graph database connector."""
    def clear(self):
        raise NotImplementedError()
        
    def add_party(self, name: str):
        raise NotImplementedError()
        
    def add_clause(self, clause_id: str, title: str, text: str):
        raise NotImplementedError()
        
    def add_obligation(self, rule_id: str, party: str, rule_type: str, action: str, condition: str, clause_id: str):
        raise NotImplementedError()
        
    def add_relationship(self, from_id: str, to_id: str, rel_type: str):
        raise NotImplementedError()
        
    def get_graph_data(self) -> Dict[str, Any]:
        """Returns data in D3 format: { "nodes": [{id, label, properties}], "links": [{source, target, type}] }"""
        raise NotImplementedError()


class MemgraphConnector(GraphConnector):
    """Memgraph graph database implementation using Neo4j bolt protocol."""
    def __init__(self, uri: str = "bolt://localhost:7687", user: str = "", password: str = ""):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver = None
        if NEO4J_AVAILABLE:
            try:
                self.driver = GraphDatabase.driver(uri, auth=(user, password))
                # Test connection
                with self.driver.session() as session:
                    session.run("RETURN 1")
                logger.info("Connected to Memgraph database successfully.")
            except Exception as e:
                logger.error(f"Failed to connect to Memgraph at {uri}: {e}")
                self.driver = None

    def is_connected(self) -> bool:
        return self.driver is not None

    def clear(self):
        if not self.driver:
            return
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    def add_party(self, name: str):
        if not self.driver:
            return
        with self.driver.session() as session:
            session.run("MERGE (p:Party {name: $name})", name=name)

    def add_clause(self, clause_id: str, title: str, text: str):
        if not self.driver:
            return
        with self.driver.session() as session:
            session.run(
                "MERGE (c:Clause {id: $clause_id}) ON CREATE SET c.title = $title, c.text = $text",
                clause_id=clause_id, title=title, text=text
            )

    def add_obligation(self, rule_id: str, party: str, rule_type: str, action: str, condition: str, clause_id: str):
        if not self.driver:
            return
        with self.driver.session() as session:
            # Create obligation node
            session.run(
                """
                MERGE (o:Obligation {id: $rule_id})
                ON CREATE SET o.type = $rule_type, o.action = $action, o.condition = $condition
                """,
                rule_id=rule_id, rule_type=rule_type, action=action, condition=condition
            )
            # Link to party
            session.run(
                """
                MATCH (p:Party {name: $party}), (o:Obligation {id: $rule_id})
                MERGE (p)-[:HAS_OBLIGATION]->(o)
                """,
                party=party, rule_id=rule_id
            )
            # Link to clause
            session.run(
                """
                MATCH (c:Clause {id: $clause_id}), (o:Obligation {id: $rule_id})
                MERGE (o)-[:DEFINED_IN]->(c)
                """,
                clause_id=clause_id, rule_id=rule_id
            )

    def add_relationship(self, from_id: str, to_id: str, rel_type: str):
        if not self.driver:
            return
        valid_rels = ["CONTRADICTS", "EXEMPTED_BY", "DEFINED_IN", "HAS_OBLIGATION"]
        if rel_type not in valid_rels:
            raise ValueError(f"Invalid relationship type: {rel_type}")
            
        with self.driver.session() as session:
            session.run(
                f"""
                MATCH (a {{id: $from_id}}), (b {{id: $to_id}})
                MERGE (a)-[:{rel_type}]->(b)
                """,
                from_id=from_id, to_id=to_id
            )

    def get_graph_data(self) -> Dict[str, Any]:
        if not self.driver:
            return {"nodes": [], "links": []}
        
        nodes = []
        links = []
        with self.driver.session() as session:
            # Query all nodes
            result_nodes = session.run("MATCH (n) RETURN n")
            for record in result_nodes:
                node = record["n"]
                labels = list(node.labels)
                label = labels[0] if labels else "Unknown"
                props = dict(node)
                
                # Use name for party, title or id for others
                node_id = props.get("id") or props.get("name")
                nodes.append({
                    "id": node_id,
                    "label": label,
                    "properties": props
                })
                
            # Query all relationships
            result_rels = session.run("MATCH (a)-[r]->(b) RETURN a, r, b")
            for record in result_rels:
                a_id = record["a"].get("id") or record["a"].get("name")
                b_id = record["b"].get("id") or record["b"].get("name")
                rel_type = record["r"].type
                links.append({
                    "source": a_id,
                    "target": b_id,
                    "type": rel_type
                })
                
        return {"nodes": nodes, "links": links}


class InMemoryGraphConnector(GraphConnector):
    """Fallback in-memory graph repository using dicts."""
    def __init__(self):
        self.nodes = {}
        self.links = []

    def clear(self):
        self.nodes.clear()
        self.links.clear()

    def add_party(self, name: str):
        if name not in self.nodes:
            self.nodes[name] = {
                "id": name,
                "label": "Party",
                "properties": {"name": name}
            }

    def add_clause(self, clause_id: str, title: str, text: str):
        if clause_id not in self.nodes:
            self.nodes[clause_id] = {
                "id": clause_id,
                "label": "Clause",
                "properties": {"id": clause_id, "title": title, "text": text}
            }

    def add_obligation(self, rule_id: str, party: str, rule_type: str, action: str, condition: str, clause_id: str):
        self.nodes[rule_id] = {
            "id": rule_id,
            "label": "Obligation",
            "properties": {
                "id": rule_id,
                "type": rule_type,
                "action": action,
                "condition": condition
            }
        }
        self.add_party(party)
        self.add_clause(clause_id, f"Clause {clause_id}", "Content omitted")
        
        # Add relationships
        self.add_relationship(party, rule_id, "HAS_OBLIGATION")
        self.add_relationship(rule_id, clause_id, "DEFINED_IN")

    def add_relationship(self, from_id: str, to_id: str, rel_type: str):
        link = {
            "source": from_id,
            "target": to_id,
            "type": rel_type
        }
        if link not in self.links:
            self.links.append(link)

    def get_graph_data(self) -> Dict[str, Any]:
        return {
            "nodes": list(self.nodes.values()),
            "links": self.links
        }


def get_graph_db(uri: str = "bolt://localhost:7687") -> GraphConnector:
    """Factory to get the working graph database or fallback to in-memory."""
    # Attempt to load Memgraph
    memgraph = MemgraphConnector(uri)
    if memgraph.is_connected():
        return memgraph
    else:
        logger.warning("Could not connect to Memgraph. Using InMemoryGraphConnector fallback.")
        return InMemoryGraphConnector()
