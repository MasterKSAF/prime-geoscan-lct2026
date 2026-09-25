"""Typeset the reviewed Markdown formulary; never infer acceptance signatures."""
from pathlib import Path
import re
import html
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/pdf/prime-planner-formular-0.4.0.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
FONT = Path('C:/Windows/Fonts')
for name, file in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'), ('Arial-Italic', 'ariali.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT / file)))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')
INK, BLUE, MUTED = '#1b3048', '#165c90', '#51657b'
styles = {
    'body': ParagraphStyle('body', fontName='Arial', fontSize=9.4, leading=14, textColor=colors.HexColor(INK), spaceAfter=7),
    'table': ParagraphStyle('table', fontName='Arial', fontSize=8.2, leading=11.5, textColor=colors.HexColor(INK), wordWrap='CJK'),
    'h1': ParagraphStyle('h1', fontName='Arial-Bold', fontSize=20, leading=25, textColor=colors.HexColor(BLUE), spaceAfter=12),
    'h2': ParagraphStyle('h2', fontName='Arial-Bold', fontSize=13, leading=17, textColor=colors.HexColor(BLUE), spaceBefore=13, spaceAfter=7, keepWithNext=True),
    'h3': ParagraphStyle('h3', fontName='Arial-Bold', fontSize=10.5, leading=15, textColor=colors.HexColor(INK), spaceBefore=9, spaceAfter=6, keepWithNext=True),
}

def inline(text):
    text = text.replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '-')
    # Source links remain readable labels. The accompanying Markdown retains exact targets.
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1', text)
    text = html.escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`([^`]+)`', r'<font color="#315e82">\1</font>', text)
    return text

source = (ROOT / 'docs/planner/submission/FORMULAR-GOST.md').read_text(encoding='utf-8')
lines, story, i = source.splitlines(), [], 0
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    if line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].strip().startswith('|'):
            cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[:\-\s]+', c) for c in cells):
                rows.append(cells)
            i += 1
        width = A4[0] - 90
        n = max(len(r) for r in rows)
        widths = [width * .29, width * .71] if n == 2 else [width/n] * n
        content = [[Paragraph(inline(c), styles['table']) for c in row] for row in rows]
        table = Table(content, colWidths=widths, repeatRows=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e4eff7')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f6f8fb')]),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),7), ('RIGHTPADDING',(0,0),(-1,-1),7),
            ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#b0c8dc')),
        ]))
        story.extend([table, Spacer(1,8)])
        continue
    heading = re.match(r'^(#{1,3})\s+(.+)$', line)
    if heading:
        story.append(Paragraph(inline(heading[2]), styles['h'+str(len(heading[1]))]))
    else:
        paragraph = [line]
        while i + 1 < len(lines) and lines[i+1].strip() and not re.match(r'^(#|\||- |\d+\.)', lines[i+1].strip()):
            i += 1
            paragraph.append(lines[i].strip())
        text = ' '.join(paragraph)
        if text.startswith('- '):
            text = '• ' + text[2:]
        story.append(Paragraph(inline(text), styles['body']))
    i += 1

def furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont('Arial',8)
    canvas.setFillColor(colors.HexColor(MUTED))
    canvas.drawString(45,A4[1]-27,'ПРАЙМ / Planner 0.4.0 · Формуляр программного изделия')
    canvas.drawString(45,25,'25.09.2026 · Электронный экземпляр · Не свидетельство авиационной сертификации')
    canvas.drawRightString(A4[0]-45,25,str(doc.page))
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=45,rightMargin=45,topMargin=48,bottomMargin=45,
    title='ПРАЙМ · Planner 0.4.0 · Формуляр',author='Команда ПРАЙМ',subject='Формуляр по структуре ГОСТ 19.501-78')
doc.build(story,onFirstPage=furniture,onLaterPages=furniture)
print(OUTPUT)
