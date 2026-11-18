#!/usr/bin/env python3
"""
AIScripto AI Marketing Suite — Professional PDF Report Generator
Generates clean, client-ready marketing deliverables for all 14 marketing tools & skills:
- Full Marketing Audit (/market audit)
- 60-Second Quick Snapshot (/market quick)
- Copywriting & Rewrites (/market copy)
- Email Sequences (/market emails)
- 30-Day Social Content Calendar (/market social)
- Multi-Platform Ad Creatives (/market ads)
- Sales Funnel & CRO (/market funnel)
- Competitive Intelligence (/market competitors)
- Landing Page Audit (/market landing)
- Product Launch Playbook (/market launch)
- Client Marketing Proposal (/market proposal)
- Markdown & PDF Reports (/market report, /market report-pdf)
- SEO Content & Technical Audit (/market seo)
- Brand Voice Guidelines (/market brand)

Guarantees:
- ZERO empty or orphan placeholder pages.
- ZERO raw JSON dumps or syntax trees.
- Beautiful native tables, score badges, callout cards, and clean typography.
- Two-pass canvas with running header, footer, and "Page X of Y" pagination.
"""

import sys
import json
import os
import re
from xml.sax.saxutils import escape
from datetime import datetime

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.lib.colors import HexColor, white, black
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
    )
    from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Group, Line
    from reportlab.pdfgen import canvas
except ImportError:
    print("Error: reportlab is required. Install with: pip install reportlab", file=sys.stderr)
    sys.exit(1)

# AIScripto Executive Color Palette
COLORS = {
    "primary": HexColor("#0F172A"),       # Dark Slate 900
    "secondary": HexColor("#1E293B"),     # Slate 800
    "accent": HexColor("#2563EB"),        # Royal Blue 600
    "accent_hover": HexColor("#1D4ED8"),  # Blue 700
    "accent_light": HexColor("#EFF6FF"),  # Blue 50
    "accent_border": HexColor("#BFDBFE"), # Blue 200
    "success": HexColor("#10B981"),       # Emerald 500
    "success_light": HexColor("#ECFDF5"), # Emerald 50
    "success_border": HexColor("#A7F3D0"),# Emerald 200
    "warning": HexColor("#F59E0B"),       # Amber 500
    "warning_light": HexColor("#FFFBEB"), # Amber 50
    "warning_border": HexColor("#FDE68A"),# Amber 200
    "danger": HexColor("#EF4444"),        # Red 500
    "danger_light": HexColor("#FEF2F2"),  # Red 50
    "danger_border": HexColor("#FECACA"), # Red 200
    "light_bg": HexColor("#F8FAFC"),      # Slate 50
    "card_bg": HexColor("#F1F5F9"),       # Slate 100
    "text": HexColor("#1E293B"),          # Slate 800
    "text_muted": HexColor("#64748B"),    # Slate 500
    "border": HexColor("#E2E8F0"),        # Slate 200
    "border_dark": HexColor("#CBD5E1"),   # Slate 300
    "white": white,
    "black": black,
}


def score_color(score):
    """Return color matching a 0-100 or 0-10 score."""
    val = score * 10 if score <= 10 else score
    if val >= 80:
        return COLORS["success"]
    elif val >= 65:
        return COLORS["accent"]
    elif val >= 50:
        return COLORS["warning"]
    return COLORS["danger"]


def score_grade(score):
    """Return letter grade for a score."""
    val = score * 10 if score <= 10 else score
    if val >= 90:
        return "A+"
    elif val >= 80:
        return "A"
    elif val >= 70:
        return "B"
    elif val >= 60:
        return "C"
    elif val >= 50:
        return "D"
    return "F"


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas for dynamic total page count, running headers, and footers."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Suppress running header and footer on cover page

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(COLORS["text_muted"])

        doc_title = getattr(self, "report_title", "AIScripto Marketing Intelligence")
        doc_date = getattr(self, "report_date", "")

        # Top Running Header
        self.drawString(50, 750, doc_title[:65])
        if doc_date:
            self.drawRightString(562, 750, doc_date)
        self.setStrokeColor(COLORS["border"])
        self.setLineWidth(0.5)
        self.line(50, 743, 562, 743)

        # Bottom Running Footer
        self.line(50, 45, 562, 45)
        self.drawString(50, 33, "AIScripto AI Marketing Suite  •  Confidential & Proprietary")
        self.drawRightString(562, 33, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def draw_score_gauge(score, size=85):
    """Create a modern circular score gauge drawing."""
    d = Drawing(size + 20, size + 25)
    center_x = (size + 20) / 2
    center_y = (size + 25) / 2 + 5
    radius = size / 2

    # Outer subtle background ring
    d.add(Circle(center_x, center_y, radius, fillColor=COLORS["light_bg"], strokeColor=COLORS["border"], strokeWidth=1.5))

    # Colored score accent circle
    color = score_color(score)
    d.add(Circle(center_x, center_y, radius - 6, fillColor=color, strokeColor=None))

    # Inner crisp white core
    d.add(Circle(center_x, center_y, radius - 14, fillColor=COLORS["white"], strokeColor=None))

    # Numeric score text
    score_int = int(round(score))
    d.add(String(center_x, center_y - 6, str(score_int), fontSize=22, fillColor=COLORS["primary"], textAnchor="middle", fontName="Helvetica-Bold"))

    # Out of 100 indicator
    d.add(String(center_x, center_y - 18, "/ 100", fontSize=8, fillColor=COLORS["text_muted"], textAnchor="middle", fontName="Helvetica"))

    # Letter Grade Pill underneath
    grade = score_grade(score)
    d.add(Rect(center_x - 26, 2, 52, 14, rx=4, ry=4, fillColor=color, strokeColor=None))
    d.add(String(center_x, 5, f"Grade: {grade}", fontSize=8, fillColor=COLORS["white"], textAnchor="middle", fontName="Helvetica-Bold"))

    return d


def create_category_bar_chart(categories, width=500, height=None):
    """Create a horizontal bar chart for categorical scores."""
    cat_items = list(categories.items())
    if not cat_items:
        return None

    bar_height = 18
    gap = 10
    total_height = height or max(130, len(cat_items) * (bar_height + gap) + 30)

    d = Drawing(width, total_height)
    max_bar_width = width - 190
    start_y = total_height - 25
    label_x = 5
    bar_x = 160

    for i, (cat_name, cat_info) in enumerate(cat_items):
        y = start_y - i * (bar_height + gap)
        score = cat_info.get("score") if isinstance(cat_info, dict) else cat_info
        try:
            score_val = float(score) if score is not None else 0.0
        except (ValueError, TypeError):
            score_val = 0.0

        if score_val <= 10:
            score_val = score_val * 10

        # Category label
        display_label = str(cat_name)[:24]
        d.add(String(label_x, y + 4, display_label, fontSize=9, fillColor=COLORS["text"], textAnchor="start", fontName="Helvetica-Bold"))

        # Background track
        d.add(Rect(bar_x, y, max_bar_width, bar_height, rx=3, ry=3, fillColor=COLORS["card_bg"], strokeColor=None))

        # Colored score fill
        bar_w = max(4, min(max_bar_width, (score_val / 100.0) * max_bar_width))
        d.add(Rect(bar_x, y, bar_w, bar_height, rx=3, ry=3, fillColor=score_color(score_val), strokeColor=None))

        # Score text badge
        d.add(String(bar_x + max_bar_width + 10, y + 4, f"{int(round(score_val))}/100", fontSize=9, fillColor=COLORS["primary"], textAnchor="start", fontName="Helvetica-Bold"))

    return d


def clean_markdown_text(text):
    """Sanitize and convert inline markdown formatting to ReportLab XML tags."""
    if not text:
        return ""
    text = str(text)
    # XML Escape & < >
    text = escape(text)
    # **bold**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # *italic* or _italic_
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    # `code`
    text = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#0F172A"><b>\1</b></font>', text)
    # [text](url)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r'<u><font color="#2563EB">\1</font></u>', text)
    return text


def build_markdown_table_flowable(table_lines, styles, max_width=512):
    """Parse a markdown table into a styled ReportLab Table flowable."""
    rows = []
    for line in table_lines:
        line_str = line.strip()
        if not line_str.startswith("|"):
            continue
        cells = [c.strip() for c in line_str.split("|")[1:-1]]
        # Skip divider row (|---|---|)
        if all(set(c) <= {"-", ":", " "} for c in cells):
            continue
        rows.append(cells)

    if not rows:
        return None

    col_count = max(len(r) for r in rows)
    if col_count == 0:
        return None

    # Normalize row lengths
    normalized_rows = []
    for r in rows:
        r_padded = r + [""] * (col_count - len(r))
        normalized_rows.append(r_padded)

    # Calculate column widths
    if col_count == 2:
        col_widths = [140, max_width - 140]
    elif col_count == 3:
        col_widths = [130, 100, max_width - 230]
    elif col_count == 4:
        col_widths = [110, 85, 145, max_width - 340]
    else:
        col_widths = [max_width / col_count] * col_count

    table_data = []
    cell_style = styles["ReportTableCell"]
    header_style = styles["ReportTableHeader"]

    for r_idx, row in enumerate(normalized_rows):
        formatted_row = []
        is_header = (r_idx == 0)
        style_to_use = header_style if is_header else cell_style
        for cell_text in row:
            clean_cell = clean_markdown_text(cell_text)
            formatted_row.append(Paragraph(clean_cell, style_to_use))
        table_data.append(formatted_row)

    table = Table(table_data, colWidths=col_widths)
    t_style = [
        ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(table_data)):
        bg = COLORS["white"] if i % 2 != 0 else COLORS["light_bg"]
        t_style.append(("BACKGROUND", (0, i), (-1, i), bg))

    table.setStyle(TableStyle(t_style))
    return table


def render_json_block(raw_json_str, styles, max_width=512):
    """Parse JSON output from specialist agents or tools into structured cards."""
    try:
        data = json.loads(raw_json_str)
    except Exception:
        # Not JSON, render as preformatted code block
        code_style = ParagraphStyle("CodeStyle", parent=styles["Normal"], fontName="Courier", fontSize=8, leading=11, textColor=COLORS["text"])
        elements = [
            Spacer(1, 4),
            Table([[Paragraph(escape(raw_json_str[:2500]), code_style)]], colWidths=[max_width], style=[
                ("BACKGROUND", (0, 0), (-1, -1), COLORS["light_bg"]),
                ("BOX", (0, 0), (-1, -1), 0.5, COLORS["border"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]),
            Spacer(1, 8),
        ]
        return elements

    if not isinstance(data, dict):
        return []

    elements = []
    heading_style = styles["ReportH2"]
    body_style = styles["ReportBody"]
    bold_style = styles["ReportBold"]

    # 1. Overall Score if present
    score = data.get("overallScore") or data.get("score") or data.get("brandScore")
    if score is not None:
        try:
            score_num = float(score)
            color = score_color(score_num)
            score_display = f"{score_num:.1f}/10" if score_num <= 10 else f"{int(score_num)}/100"
            badge_html = f'<font color="{color.hexval()}"><b>{score_display}</b> ({score_grade(score_num)})</font>'
            elements.append(Paragraph(f"Specialist Assessment Score: {badge_html}", bold_style))
            elements.append(Spacer(1, 4))
        except (ValueError, TypeError):
            pass

    # 2. Dimension Scores
    dimension_scores = data.get("dimensionScores") or data.get("brandAssessment") or data.get("growthAssessment")
    if isinstance(dimension_scores, dict) and dimension_scores:
        table_rows = [["Dimension", "Score", "Finding"]]
        for dim_name, dim_val in dimension_scores.items():
            readable_dim = re.sub(r"([A-Z])", r" \1", dim_name).strip().title()
            if isinstance(dim_val, dict):
                dim_score = dim_val.get("score", "—")
                dim_finding = dim_val.get("finding") or dim_val.get("notes") or "—"
            else:
                dim_score = str(dim_val)
                dim_finding = "—"
            score_str = f"{dim_score}/10" if str(dim_score).replace(".", "", 1).isdigit() else str(dim_score)
            table_rows.append([readable_dim, score_str, dim_finding])

        dim_table = Table(
            [[Paragraph(f"<b>{c}</b>" if idx == 0 else c, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for c in row] for idx, row in enumerate(table_rows)],
            colWidths=[130, 65, max_width - 195]
        )
        dim_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["secondary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(dim_table)
        elements.append(Spacer(1, 8))

    # 3. Top Wins / Strengths
    top_wins = data.get("topWins") or data.get("strengths") or data.get("wins")
    if isinstance(top_wins, list) and top_wins:
        elements.append(Paragraph("<b>Top Strengths & Wins:</b>", bold_style))
        for win in top_wins:
            elements.append(Paragraph(f"• <font color=\"#10B981\">✓</font> {clean_markdown_text(win)}", body_style))
        elements.append(Spacer(1, 6))

    # 4. Critical Fixes / Leaks / Technical Issues
    fixes = data.get("criticalFixes") or data.get("funnelLeaks") or data.get("technicalIssues")
    if isinstance(fixes, list) and fixes:
        elements.append(Paragraph("<b>Identified Friction Points & Recommended Fixes:</b>", bold_style))
        fix_rows = [["Issue / Stage", "Recommendation / Fix"]]
        for f in fixes:
            if isinstance(f, dict):
                title = f.get("issue") or f.get("stage") or f.get("name") or "Issue"
                rec = f.get("recommendation") or f.get("fix") or f.get("impact") or "—"
                fix_rows.append([title, rec])
            else:
                fix_rows.append(["Fix", str(f)])

        fix_table = Table(
            [[Paragraph(f"<b>{c}</b>" if idx == 0 else c, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for c in row] for idx, row in enumerate(fix_rows)],
            colWidths=[150, max_width - 150]
        )
        fix_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(fix_table)
        elements.append(Spacer(1, 8))

    # 5. Before / After Rewrites
    rewrites = data.get("beforeAfterRewrites") or data.get("rewrites")
    if isinstance(rewrites, list) and rewrites:
        elements.append(Paragraph("<b>Copywriting Optimizations (Before vs. After):</b>", bold_style))
        rw_rows = [["Element", "Current (Before)", "Optimized (After)", "Rationale"]]
        for rw in rewrites:
            if isinstance(rw, dict):
                elem = rw.get("element") or rw.get("page") or "Copy"
                before = rw.get("before") or "—"
                after = rw.get("after") or "—"
                why = rw.get("why") or "—"
                rw_rows.append([elem, before, after, why])

        rw_table = Table(
            [[Paragraph(f"<b>{c}</b>" if idx == 0 else c, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for c in row] for idx, row in enumerate(rw_rows)],
            colWidths=[90, 140, 150, max_width - 380]
        )
        rw_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["secondary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(rw_table)
        elements.append(Spacer(1, 8))

    # 6. Opportunities / Recommended Actions
    actions = data.get("recommendedActions") or data.get("opportunities") or data.get("seoQuickWins") or data.get("quickCROWins")
    if isinstance(actions, list) and actions:
        elements.append(Paragraph("<b>Key Opportunities & Action Items:</b>", bold_style))
        for act in actions:
            if isinstance(act, dict):
                act_text = f"<b>{act.get('name') or act.get('opportunity') or 'Action'}:</b> {act.get('description') or act.get('expectedImpact') or ''}"
            else:
                act_text = str(act)
            elements.append(Paragraph(f"• {clean_markdown_text(act_text)}", body_style))
        elements.append(Spacer(1, 6))

    return elements


def parse_content_to_flowables(full_report, styles, max_width=512):
    """Parse rich markdown and structured JSON into professional ReportLab flowables."""
    elements = []
    lines = str(full_report).splitlines()
    idx = 0
    total_lines = len(lines)

    h1_style = styles["ReportH1"]
    h2_style = styles["ReportH2"]
    h3_style = styles["ReportH3"]
    body_style = styles["ReportBody"]
    callout_style = styles["ReportCallout"]

    while idx < total_lines:
        line = lines[idx]
        stripped = line.strip()

        # Skip empty lines
        if not stripped:
            idx += 1
            continue

        # 1. Code Block (```json or ```)
        if stripped.startswith("```"):
            block_lines = []
            is_json = "json" in stripped.lower()
            idx += 1
            while idx < total_lines and not lines[idx].strip().startswith("```"):
                block_lines.append(lines[idx])
                idx += 1
            idx += 1  # consume closing ```
            raw_block = "\n".join(block_lines).strip()
            if is_json or (raw_block.startswith("{") and raw_block.endswith("}")):
                json_flowables = render_json_block(raw_block, styles, max_width)
                elements.extend(json_flowables)
            else:
                code_style = ParagraphStyle("CodeBox", parent=styles["Normal"], fontName="Courier", fontSize=8.5, leading=11, textColor=COLORS["text"])
                elements.append(Table([[Paragraph(escape(raw_block), code_style)]], colWidths=[max_width], style=[
                    ("BACKGROUND", (0, 0), (-1, -1), COLORS["light_bg"]),
                    ("BOX", (0, 0), (-1, -1), 0.5, COLORS["border"]),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]))
                elements.append(Spacer(1, 6))
            continue

        # 2. Markdown Table (| Col 1 | Col 2 |)
        if stripped.startswith("|"):
            table_lines = []
            while idx < total_lines and lines[idx].strip().startswith("|"):
                table_lines.append(lines[idx])
                idx += 1
            tbl = build_markdown_table_flowable(table_lines, styles, max_width)
            if tbl:
                elements.append(tbl)
                elements.append(Spacer(1, 8))
            continue

        # 3. Horizontal Rule (---)
        if re.match(r"^(\-{3,}|\_{3,}|\*{3,})$", stripped):
            elements.append(Spacer(1, 6))
            elements.append(HRFlowable(width="100%", thickness=0.5, color=COLORS["border"], spaceBefore=4, spaceAfter=8))
            idx += 1
            continue

        # 4. Heading 1 (# Title)
        if stripped.startswith("# "):
            text = clean_markdown_text(stripped[2:])
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(text, h1_style))
            elements.append(HRFlowable(width="100%", thickness=1.5, color=COLORS["accent"], spaceBefore=3, spaceAfter=8))
            idx += 1
            continue

        # 5. Heading 2 (## Section)
        if stripped.startswith("## "):
            text = clean_markdown_text(stripped[3:])
            elements.append(Spacer(1, 8))
            # Check if this is an Email or Social Card
            if text.lower().startswith("email "):
                # Email banner card
                banner_table = Table([[Paragraph(f"<b>{text}</b>", styles["ReportTableHeader"])]], colWidths=[max_width], style=[
                    ("BACKGROUND", (0, 0), (-1, -1), COLORS["secondary"]),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ])
                elements.append(banner_table)
                elements.append(Spacer(1, 6))
            else:
                elements.append(Paragraph(text, h2_style))
            idx += 1
            continue

        # 6. Heading 3 (### Subsection)
        if stripped.startswith("### "):
            text = clean_markdown_text(stripped[4:])
            elements.append(Spacer(1, 6))
            elements.append(Paragraph(text, h3_style))
            idx += 1
            continue

        # 7. Blockquote (> Quote / Note)
        if stripped.startswith(">"):
            quote_lines = []
            while idx < total_lines and lines[idx].strip().startswith(">"):
                quote_lines.append(lines[idx].strip().lstrip(">").strip())
                idx += 1
            quote_text = clean_markdown_text(" ".join(quote_lines))
            quote_table = Table([[Paragraph(quote_text, callout_style)]], colWidths=[max_width], style=[
                ("BACKGROUND", (0, 0), (-1, -1), COLORS["accent_light"]),
                ("BOX", (0, 0), (-1, -1), 0.5, COLORS["accent_border"]),
                ("LINEBEFORE", (0, 0), (0, -1), 3.0, COLORS["accent"]),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ])
            elements.append(quote_table)
            elements.append(Spacer(1, 6))
            continue

        # 8. Bullet item (- or * or •)
        if stripped.startswith(("- ", "* ", "• ")):
            bullet_text = clean_markdown_text(stripped[2:])
            elements.append(Paragraph(f"• {bullet_text}", body_style))
            idx += 1
            continue

        # 9. Numbered list (1. item)
        numbered_match = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if numbered_match:
            num = numbered_match.group(1)
            num_text = clean_markdown_text(numbered_match.group(2))
            elements.append(Paragraph(f"<b>{num}.</b> {num_text}", body_style))
            idx += 1
            continue

        # 10. Normal paragraph
        elements.append(Paragraph(clean_markdown_text(stripped), body_style))
        idx += 1

    return elements


def generate_report(data, output_path):
    """
    Generate a professional client-ready marketing PDF report.
    Guarantees no empty pages, no raw JSON, and support for all 14 marketing tools.
    """
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=50,
        leftMargin=50,
        topMargin=55,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()

    # Custom Typography Hierarchy
    styles.add(ParagraphStyle(
        "ReportEyebrow",
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=COLORS["accent"],
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "ReportTitle",
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=COLORS["primary"],
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        "ReportSubtitle",
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=COLORS["text_muted"],
        spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        "ReportH1",
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=COLORS["primary"],
        spaceBefore=14,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        "ReportH2",
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=COLORS["accent"],
        spaceBefore=12,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        "ReportH3",
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=COLORS["secondary"],
        spaceBefore=8,
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "ReportBody",
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=COLORS["text"],
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "ReportBold",
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=14,
        textColor=COLORS["primary"],
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "ReportCallout",
        fontName="Helvetica-Oblique",
        fontSize=9.5,
        leading=14,
        textColor=COLORS["primary"],
    ))
    styles.add(ParagraphStyle(
        "ReportTableHeader",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=COLORS["white"],
    ))
    styles.add(ParagraphStyle(
        "ReportTableCell",
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=COLORS["text"],
    ))

    # Printable width: 612 - 100 = 512 pt
    printable_width = 512
    elements = []

    # Metadata extraction
    report_type = str(data.get("report_type") or "").lower()
    title = data.get("title") or "Marketing Intelligence Report"
    brand_name = data.get("brand_name") or "AIScripto Target"
    url = data.get("url") or ""
    date_str = data.get("date") or datetime.now().strftime("%B %d, %Y")

    # Set canvas properties for running header/footer
    NumberedCanvas.report_title = title
    NumberedCanvas.report_date = date_str

    # =========================================================================
    # 1. COVER / EXECUTIVE SUMMARY HEADER
    # =========================================================================
    elements.append(Paragraph("AISCRIPTO AI MARKETING INTELLIGENCE", styles["ReportEyebrow"]))
    elements.append(Paragraph(title, styles["ReportTitle"]))

    # Target info bar
    meta_info_lines = []
    if brand_name:
        meta_info_lines.append(f"<b>Brand / Project:</b> {escape(brand_name)}")
    if url:
        meta_info_lines.append(f"<b>Target URL:</b> {escape(url)}")
    meta_info_lines.append(f"<b>Generated:</b> {date_str}")
    elements.append(Paragraph("  •  ".join(meta_info_lines), styles["ReportSubtitle"]))
    elements.append(Spacer(1, 10))

    # Overall Score Gauge (ONLY if overall_score is a valid number)
    overall_score = data.get("overall_score")
    has_valid_score = False
    if overall_score is not None:
        try:
            score_val = float(overall_score)
            has_valid_score = True
            gauge = draw_score_gauge(score_val, size=85)

            # Executive summary paragraph
            exec_summary = data.get("executive_summary") or f"Comprehensive marketing audit evaluating marketing performance, conversion funnel, and discoverability."
            summary_p = Paragraph(f"<b>Executive Summary:</b><br/>{clean_markdown_text(exec_summary)}", styles["ReportBody"])

            # Place Gauge and Summary side-by-side in a card table
            score_card = Table([[gauge, summary_p]], colWidths=[120, printable_width - 120])
            score_card.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, -1), COLORS["light_bg"]),
                ("BOX", (0, 0), (-1, -1), 0.5, COLORS["border"]),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]))
            elements.append(score_card)
            elements.append(Spacer(1, 14))
        except (ValueError, TypeError):
            pass

    if not has_valid_score:
        # For non-score reports (SEO, Social, Emails, Ads, etc.), show clean metadata card
        exec_summary = data.get("executive_summary") or f"{title}. Delivered by AIScripto AI Marketing Suite."
        summary_p = Paragraph(f"<b>Executive Summary:</b><br/>{clean_markdown_text(exec_summary)}", styles["ReportBody"])
        overview_card = Table([[summary_p]], colWidths=[printable_width])
        overview_card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLORS["light_bg"]),
            ("BOX", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ]))
        elements.append(overview_card)
        elements.append(Spacer(1, 14))

    # =========================================================================
    # 2. CATEGORICAL SCORE BREAKDOWN (ONLY if categories has items)
    # =========================================================================
    categories = data.get("categories", {})
    valid_categories = {}
    if isinstance(categories, dict):
        for k, v in categories.items():
            if isinstance(v, dict) and v.get("score") is not None:
                valid_categories[k] = v
            elif isinstance(v, (int, float)):
                valid_categories[k] = {"score": v}

    if valid_categories:
        elements.append(Paragraph("Category Performance Breakdown", styles["ReportH1"]))
        chart = create_category_bar_chart(valid_categories, width=printable_width)
        if chart:
            elements.append(chart)
            elements.append(Spacer(1, 8))

        cat_table_data = [["Category", "Score", "Weight", "Assessment"]]
        for c_name, c_info in valid_categories.items():
            sc = float(c_info.get("score", 0))
            if sc <= 10:
                sc = sc * 10
            wt = str(c_info.get("weight", "—"))
            status = "Strong" if sc >= 75 else "Needs Work" if sc >= 50 else "Critical Issue"
            status_color = "#10B981" if sc >= 75 else "#F59E0B" if sc >= 50 else "#EF4444"
            cat_table_data.append([
                c_name,
                f"{int(round(sc))}/100",
                wt,
                f'<font color="{status_color}"><b>{status}</b></font>'
            ])

        cat_table = Table(
            [[Paragraph(f"<b>{cell}</b>" if idx == 0 else cell, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for cell in row] for idx, row in enumerate(cat_table_data)],
            colWidths=[180, 80, 80, printable_width - 340]
        )
        cat_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(cat_table)
        elements.append(Spacer(1, 14))

    # =========================================================================
    # 3. KEY FINDINGS (ONLY if findings list has items)
    # =========================================================================
    findings = data.get("findings", [])
    if isinstance(findings, list) and findings:
        elements.append(Paragraph("Prioritized Audit Findings", styles["ReportH1"]))
        findings_data = [["Severity", "Finding Description"]]
        severity_colors = {
            "critical": "#EF4444",
            "high": "#F59E0B",
            "medium": "#2563EB",
            "low": "#64748B",
            "recommended": "#2563EB"
        }
        for f in findings:
            if isinstance(f, dict):
                sev = str(f.get("severity") or "Recommended").capitalize()
                color = severity_colors.get(sev.lower(), "#2563EB")
                desc = clean_markdown_text(f.get("finding") or f.get("description") or "")
                findings_data.append([f'<font color="{color}"><b>{sev}</b></font>', desc])
            else:
                findings_data.append(["<b>Recommended</b>", clean_markdown_text(str(f))])

        findings_table = Table(
            [[Paragraph(f"<b>{cell}</b>" if idx == 0 else cell, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for cell in row] for idx, row in enumerate(findings_data)],
            colWidths=[100, printable_width - 100]
        )
        findings_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(findings_table)
        elements.append(Spacer(1, 14))

    # =========================================================================
    # 4. ACTION PLAN (ONLY if quick_wins, medium_term, or strategic has items)
    # =========================================================================
    quick_wins = data.get("quick_wins", [])
    medium_term = data.get("medium_term", [])
    strategic = data.get("strategic", [])

    has_actions = bool(quick_wins or medium_term or strategic)
    if has_actions:
        elements.append(Paragraph("Actionable Implementation Plan", styles["ReportH1"]))

        if quick_wins:
            elements.append(Paragraph("<b>Quick Wins (Immediate Impact — This Week)</b>", styles["ReportH2"]))
            for i, win in enumerate(quick_wins, 1):
                elements.append(Paragraph(f"<b>{i}.</b> {clean_markdown_text(win)}", styles["ReportBody"]))
            elements.append(Spacer(1, 6))

        if medium_term:
            elements.append(Paragraph("<b>Medium-Term Initiatives (Month 1-3)</b>", styles["ReportH2"]))
            for i, act in enumerate(medium_term, 1):
                elements.append(Paragraph(f"<b>{i}.</b> {clean_markdown_text(act)}", styles["ReportBody"]))
            elements.append(Spacer(1, 6))

        if strategic:
            elements.append(Paragraph("<b>Strategic Growth Projects (Month 3-6)</b>", styles["ReportH2"]))
            for i, act in enumerate(strategic, 1):
                elements.append(Paragraph(f"<b>{i}.</b> {clean_markdown_text(act)}", styles["ReportBody"]))
            elements.append(Spacer(1, 6))

        elements.append(Spacer(1, 8))

    # =========================================================================
    # 5. COMPETITOR SNAPSHOT (ONLY if competitors list has items)
    # =========================================================================
    competitors = data.get("competitors", [])
    if isinstance(competitors, list) and competitors:
        elements.append(Paragraph("Competitive Landscape & Positioning", styles["ReportH1"]))
        comp_headers = ["Metric / Pillar", brand_name[:18]] + [c.get("name", f"Competitor {i+1}")[:18] for i, c in enumerate(competitors[:3])]
        comp_rows = [
            ("Core Positioning", "positioning"),
            ("Pricing Model", "pricing"),
            ("Social Proof", "social_proof"),
            ("Key Advantage", "key_advantage"),
        ]
        comp_table_data = [comp_headers]
        for label, key in comp_rows:
            row = [label, "Target Site"]
            for comp in competitors[:3]:
                row.append(str(comp.get(key) or "—"))
            comp_table_data.append(row)

        c_count = len(comp_headers)
        col_w = printable_width / c_count
        comp_table = Table(
            [[Paragraph(f"<b>{cell}</b>" if idx == 0 else cell, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for cell in row] for idx, row in enumerate(comp_table_data)],
            colWidths=[col_w] * c_count
        )
        comp_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(comp_table)
        elements.append(Spacer(1, 14))

    # =========================================================================
    # 6. METHODOLOGY (ONLY if this report had categorical scores)
    # =========================================================================
    if valid_categories:
        elements.append(Paragraph("Scoring Methodology & Benchmarks", styles["ReportH1"]))
        elements.append(Paragraph(
            "Each marketing dimension is scored on an objective 0–100 scale using competitive benchmarking, industry standards, and empirical conversion principles.",
            styles["ReportBody"]
        ))
        method_data = [
            ["Dimension", "Audit Weight", "Evaluation Focus"],
            ["Content & Messaging", "25%", "Value proposition clarity, headline conversion power, CTA efficacy"],
            ["Conversion Optimization", "20%", "Friction points, social proof placement, mobile funnel leaks"],
            ["SEO & Discoverability", "20%", "Heading hierarchy, schema markup, technical crawl signals"],
            ["Competitive Positioning", "15%", "Differentiation clarity, feature messaging vs alternatives"],
            ["Brand & Trust", "10%", "Authority indicators, trust architecture, consistency"],
            ["Growth & Strategy", "10%", "Pricing structure, acquisition velocity, retention hooks"],
        ]
        m_table = Table(
            [[Paragraph(f"<b>{cell}</b>" if idx == 0 else cell, styles["ReportTableHeader"] if idx == 0 else styles["ReportTableCell"]) for cell in row] for idx, row in enumerate(method_data)],
            colWidths=[140, 70, printable_width - 210]
        )
        m_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
            ("GRID", (0, 0), (-1, -1), 0.5, COLORS["border"]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [COLORS["white"], COLORS["light_bg"]]),
        ]))
        elements.append(m_table)
        elements.append(Spacer(1, 14))

    # =========================================================================
    # 7. DETAILED REPORT / CONTENT (Markdown, Tables, and Specialist JSON)
    # =========================================================================
    full_report = data.get("full_report") or ""
    if full_report.strip():
        # If we already had cover + scorecard + findings, insert a clean PageBreak before Detailed Report
        if valid_categories or findings:
            elements.append(PageBreak())

        content_flowables = parse_content_to_flowables(full_report, styles, max_width=printable_width)
        elements.extend(content_flowables)

    # Build the document with two-pass NumberedCanvas
    doc.build(elements, canvasmaker=NumberedCanvas)
    return output_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generate_pdf_report.py <report.json> [output.pdf]", file=sys.stderr)
        sys.exit(2)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "MARKETING-REPORT.pdf"

    with open(input_file, "r") as f:
        data = json.load(f)

    generate_report(data, output_file)
    print(f"Report generated: {output_file}")


if __name__ == "__main__":
    main()
