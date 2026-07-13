import os
import logging

logger = logging.getLogger("ContraMesh.pdf_parser")

try:
    import pypdf
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False
    logger.warning("pypdf is not installed. PDF text extraction will fall back to reading files as plain text.")

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extracts plain text from a PDF file. If the file is a plain text file,
    reads it directly. If pypdf is not installed, displays a warning and returns
    mocked or direct string contents if possible.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    _, ext = os.path.splitext(file_path.lower())
    
    if ext == '.txt':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
            
    if ext == '.pdf':
        if not PYPDF_AVAILABLE:
            raise ImportError(
                "pypdf is required to extract text from PDF files. "
                "Please run `pip install pypdf` or upload a .txt file instead."
            )
        
        text_content = []
        try:
            reader = pypdf.PdfReader(file_path)
            for page_num in range(len(reader.pages)):
                page = reader.pages[page_num]
                text = page.extract_text()
                if text:
                    text_content.append(text)
            
            return "\n\n--- PAGE BREAK ---\n\n".join(text_content)
        except Exception as e:
            logger.error(f"Error reading PDF file {file_path}: {e}")
            raise RuntimeError(f"Error parsing PDF file: {str(e)}")
            
    raise ValueError(f"Unsupported file format: {ext}. Only PDF and TXT are supported.")
