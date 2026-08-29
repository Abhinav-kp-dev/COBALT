"""
MineGuard: Forensic PDF Report Generator

Generates a professional PDF report with timestamped evidence,
metrics summaries, and site coordinates for official use.
Uses FPDF for PDF generation.
"""

from fpdf import FPDF
import os
import datetime


class MineGuardReport(FPDF):
    """Custom PDF class with MineGuard branding."""
    
    def header(self):
        # Logo area
        self.set_fill_color(10, 10, 30)
        self.rect(0, 0, 210, 35, 'F')
        
        # Title
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(255, 255, 255)
        self.set_y(8)
        self.cell(0, 10, "MineGuard.ai", ln=False, align="L")
        
        # Subtitle
        self.set_font("Helvetica", "", 9)
        self.set_text_color(150, 150, 200)
        self.set_y(18)
        self.cell(0, 8, "AUTONOMOUS GEOSPATIAL FORENSICS REPORT", ln=True, align="L")
        
        self.ln(15)
    
    def footer(self):
        self.set_y(-20)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"MineGuard.ai  |  Page {self.page_no()}/{{nb}}  |  CONFIDENTIAL", align="C")
    
    def section_title(self, title):
        """Add a styled section header."""
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(30, 30, 80)
        self.set_fill_color(230, 235, 250)
        self.cell(0, 10, f"  {title}", ln=True, fill=True)
        self.ln(3)
    
    def add_metric_row(self, label, value, unit=""):
        """Add a key-value metric row."""
        self.set_font("Helvetica", "", 10)
        self.set_text_color(80, 80, 80)
        self.cell(80, 8, f"  {label}", border=0)
        
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 20, 60)
        display_val = f"{value:,.2f} {unit}" if isinstance(value, float) else f"{value} {unit}"
        self.cell(0, 8, display_val.strip(), ln=True, border=0)
    
    def add_separator(self):
        """Add a thin horizontal line."""
        self.set_draw_color(200, 200, 220)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(3)


def generate_pdf_report(report_data, output_path="output/report.pdf"):
    """
    Generate a forensic PDF report from detection results.
    
    Args:
        report_data: dict with keys:
            - start_date, end_date: Analysis date range
            - dem_source: DEM data source identifier
            - filename: Original input filename
            - illegal_area: Illegal mining area in m2
            - legal_area: Legal mining area in m2
            - lid_elevation: Reference surface elevation in meters
            - avg_depth: Average pit depth in meters
            - volume: Illegal excavation volume in m3
            - total_volume: Total excavation volume in m3
            - trucks: Estimated truckloads
        output_path: Output file path for the PDF
    """
    print("📄 Generating Forensic PDF Report...")
    
    try:
        pdf = MineGuardReport()
        pdf.alias_nb_pages()
        pdf.set_auto_page_break(auto=True, margin=25)
        pdf.add_page()
        
        now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        
        # --- REPORT METADATA ---
        pdf.section_title("1. REPORT METADATA")
        pdf.add_metric_row("Report Generated", now)
        pdf.add_metric_row("Source File", report_data.get("filename", "N/A"))
        pdf.add_metric_row("Analysis Window", 
                           f"{report_data.get('start_date', 'N/A')} to {report_data.get('end_date', 'N/A')}")
        pdf.add_metric_row("DEM Source", report_data.get("dem_source", "N/A"))
        pdf.add_metric_row("Classification", "Triple-Lock Multi-Sensor Fusion")
        pdf.ln(5)
        
        # --- EXECUTIVE SUMMARY ---
        pdf.section_title("2. EXECUTIVE SUMMARY")
        
        illegal_area = report_data.get("illegal_area", 0)
        legal_area = report_data.get("legal_area", 0)
        volume = report_data.get("volume", 0)
        trucks = report_data.get("trucks", 0)
        
        if illegal_area > 0:
            status_text = "BOUNDARY DEVIATION DETECTED"
            severity = "HIGH" if illegal_area > 10000 else "MODERATE" if illegal_area > 1000 else "LOW"
        else:
            status_text = "NO BOUNDARY DEVIATION DETECTED"
            severity = "CLEAR"
        
        pdf.set_font("Helvetica", "B", 12)
        if illegal_area > 0:
            pdf.set_text_color(200, 30, 30)
        else:
            pdf.set_text_color(30, 150, 30)
        pdf.cell(0, 10, f"  STATUS: {status_text}", ln=True)
        
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 6, 
            f"  This report presents the findings of an automated geospatial forensic analysis "
            f"conducted on the mining lease boundary defined in '{report_data.get('filename', 'N/A')}'. "
            f"The analysis utilized multi-sensor satellite data fusion including optical imagery "
            f"(Sentinel-2) and topographical data "
            f"({report_data.get('dem_source', 'Copernicus DEM')}) to identify and quantify "
            f"mining activity within and outside the authorized lease boundary."
        )
        pdf.ln(5)
        
        # --- DETECTION METRICS ---
        pdf.section_title("3. DETECTION METRICS")
        
        # Illegal Mining subsection
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(200, 30, 30)
        pdf.cell(0, 8, "  EXTRACTION OUTSIDE LEASE BOUNDARY", ln=True)
        pdf.add_separator()
        
        pdf.add_metric_row("Deviation Area", illegal_area, "m2")
        pdf.add_metric_row("Deviation Area", illegal_area / 10000, "hectares")
        pdf.add_metric_row("Excavation Volume", volume, "m3")
        pdf.add_metric_row("Average Pit Depth", report_data.get("avg_depth", 0), "m")
        pdf.add_metric_row("Estimated Truckloads (15 m3/truck)", trucks, "trucks")
        pdf.add_metric_row("Threat Severity", severity)
        pdf.ln(3)
        
        # Legal Mining subsection
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(30, 150, 30)
        pdf.cell(0, 8, "  LEGAL MINING (Inside Lease Boundary)", ln=True)
        pdf.add_separator()
        
        pdf.add_metric_row("Authorized Mining Area", legal_area, "m2")
        pdf.add_metric_row("Authorized Mining Area", legal_area / 10000, "hectares")
        pdf.add_metric_row("Total Excavation Volume", report_data.get("total_volume", 0), "m3")
        pdf.add_metric_row("Reference Surface Elevation", report_data.get("lid_elevation", 0), "m")
        pdf.ln(5)
        
        # --- COMBINED SUMMARY TABLE ---
        pdf.section_title("4. VOLUMETRIC SUMMARY")
        
        total_area = illegal_area + legal_area
        total_vol = report_data.get("total_volume", 0)
        
        # Table header
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(30, 30, 80)
        pdf.set_text_color(255, 255, 255)
        col_widths = [60, 45, 45, 40]
        headers = ["Category", "Area (m2)", "Volume (m3)", "% of Total"]
        for i, h in enumerate(headers):
            pdf.cell(col_widths[i], 8, f" {h}", border=1, fill=True)
        pdf.ln()
        
        # Table rows
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(50, 50, 50)
        
        rows = [
            ("Outside Lease (Deviation)", illegal_area, volume, 
             f"{(illegal_area/total_area*100):.1f}%" if total_area > 0 else "0%"),
            ("Legal (Authorized)", legal_area, report_data.get("total_volume", 0) - volume,
             f"{(legal_area/total_area*100):.1f}%" if total_area > 0 else "0%"),
            ("TOTAL", total_area, total_vol, "100%"),
        ]
        
        for i, (cat, area, vol, pct) in enumerate(rows):
            if i == len(rows) - 1:
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_fill_color(240, 240, 250)
            else:
                pdf.set_fill_color(255, 255, 255)
            
            pdf.cell(col_widths[0], 8, f" {cat}", border=1, fill=True)
            pdf.cell(col_widths[1], 8, f" {area:,.1f}", border=1, fill=True)
            pdf.cell(col_widths[2], 8, f" {vol:,.1f}", border=1, fill=True)
            pdf.cell(col_widths[3], 8, f" {pct}", border=1, fill=True)
            pdf.ln()
        
        pdf.ln(5)
        
        # --- METHODOLOGY ---
        pdf.section_title("5. METHODOLOGY")
        
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        
        methods = [
            ("Lock 1 - Optical Signature (Sentinel-2)", 
             "Normalized Difference Built-up Index (NDBI) computed from SWIR and NIR bands "
             "to detect bare-soil and disturbed terrain signatures."),
            ("Lock 2 - Biological Signature (NDVI)", 
             "Normalized Difference Vegetation Index used to filter out vegetated areas. "
             "Active mining sites show NDVI below the vegetation threshold."),
            ("Lock 3 - Topographical Forensics (DEM)", 
             f"Copernicus GLO30 DEM with focal-mean smoothing (250m radius) used to reconstruct "
             f"hypothetical pre-mining terrain. Pits exceeding 2.0m depth flagged as excavation sites."),
            ("Fusion Strategy", 
             "Triple-Lock verification requires ALL three signatures to co-occur at each pixel. "
             "This eliminates false positives from natural rocky terrain, fallow agricultural land, "
             "and seasonal vegetation changes."),
        ]
        
        for title, desc in methods:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(30, 30, 80)
            pdf.cell(0, 7, f"  {title}", ln=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(80, 80, 80)
            pdf.multi_cell(0, 5, f"  {desc}")
            pdf.ln(2)
        
        pdf.ln(3)
        
        # --- DISCLAIMER ---
        pdf.section_title("6. DISCLAIMER")
        
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.multi_cell(0, 5,
            "This report is generated by an automated satellite-based monitoring system and is intended "
            "for preliminary assessment purposes. The accuracy of results depends on satellite data "
            "availability, cloud cover conditions, and the resolution of input DEM data. Field verification "
            "is recommended before initiating enforcement actions. All timestamps are in UTC. "
            "This document should be treated as CONFIDENTIAL and handled in accordance with "
            "applicable data protection regulations."
        )
        
        # --- SAVE ---
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
        pdf.output(output_path)
        
        print(f"   ✅ PDF Report saved: {output_path}")
        
    except Exception as e:
        print(f"   ❌ PDF Generation Error: {e}")
        import traceback
        traceback.print_exc()
