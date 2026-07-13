import os
import sys
import subprocess

def check_and_install_reportlab():
    try:
        import reportlab
    except ImportError:
        print("reportlab is not installed. Installing it via pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "reportlab"])

check_and_install_reportlab()

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_lease_pdf(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1e293b'),
        alignment=1, # Center
        spaceAfter=20
    )
    
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#475569'),
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=10
    )
    
    story = []
    
    # Title
    story.append(Paragraph("RESIDENTIAL LEASE AGREEMENT", title_style))
    story.append(Spacer(1, 10))
    
    # Intro
    intro_text = (
        "This Agreement is entered into by and between the Landlord and the Tenant "
        "under the following terms and conditions:"
    )
    story.append(Paragraph(intro_text, body_style))
    story.append(Spacer(1, 10))
    
    # Section 1
    story.append(Paragraph("1. RENTAL UNIT AND TERM", section_style))
    sec1_text = (
        "The Landlord hereby leases to the Tenant the premises located at 104 Cyberpunk Blvd, "
        "Apt 404. The tenancy shall commence on the first day of the month."
    )
    story.append(Paragraph(sec1_text, body_style))
    story.append(Spacer(1, 5))
    
    # Section 2
    story.append(Paragraph("2. LEAK REPORTING AND INDEMNIFICATION", section_style))
    sec2_text = (
        "In the event of any water leak, plumbing failure, or moisture intrusion, the Tenant is "
        "under a strict obligation to submit a formal Written Leak Report to the Landlord within 3 "
        "days of the leak's occurrence. Failure to report within 3 days shall constitute a material "
        "breach, and the Tenant shall be fully liable for all associated repair costs and water damage."
    )
    story.append(Paragraph(sec2_text, body_style))
    story.append(Spacer(1, 5))
    
    # Section 3
    story.append(Paragraph("3. METHOD OF NOTICE AND TRANSIT", section_style))
    sec3_text = (
        "All formal reports, notifications, or legal alerts required under this Agreement "
        "(including Written Leak Reports mentioned in Section 2) must be sent via Registered "
        "Physical Mail to the Landlord's corporate headquarters. The parties agree that registered "
        "physical mail takes exactly 5 days to deliver and process. No email, SMS, or verbal "
        "notifications shall be recognized as valid notice."
    )
    story.append(Paragraph(sec3_text, body_style))
    story.append(Spacer(1, 5))
    
    # Section 4
    story.append(Paragraph("4. LANDLORD TERMINATION RIGHTS", section_style))
    sec4_text = (
        "The Landlord reserves the absolute right to terminate this lease agreement immediately "
        "and without notice, for any reason or no reason at all, at their sole discretion."
    )
    story.append(Paragraph(sec4_text, body_style))
    story.append(Spacer(1, 5))
    
    # Section 5
    story.append(Paragraph("5. TENANT TERMINATION RIGHTS", section_style))
    sec5_text = (
        "Should the Tenant wish to terminate this lease agreement, the Tenant is obligated "
        "to provide the Landlord with at least 60 days written notice prior to the intended move-out date."
    )
    story.append(Paragraph(sec5_text, body_style))
    
    doc.build(story)
    print(f"Successfully generated PDF: {output_path}")

if __name__ == "__main__":
    output_pdf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_lease.pdf")
    generate_lease_pdf(output_pdf)
