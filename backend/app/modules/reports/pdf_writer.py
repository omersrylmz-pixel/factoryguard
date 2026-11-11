"""Saf Python, sıfır dış bağımlılıklı PDF 1.4 üreticisi.

Neden saf Python:
- Windows geliştirme ortamında ve minimal Linux container'larında GTK/Cairo/wkhtmltopdf gibi
  işletim sistemi kütüphanelerine ihtiyaç duymadan deterministik olarak çalışır.
- Çok sayfalı A4 çıktı, başlık, özet kutusu ve bölüm satırlarını standart Type1 Helvetica /
  Helvetica-Bold yazı tipleriyle üretir.
"""
from __future__ import annotations

import textwrap

# Standart PDF Type1 Helvetica için Türkçe karakter dönüşüm tablosu
_TR_MAP = str.maketrans(
    {
        "ğ": "g",
        "Ğ": "G",
        "ü": "u",
        "Ü": "U",
        "ş": "s",
        "Ş": "S",
        "ı": "i",
        "İ": "I",
        "ö": "o",
        "Ö": "O",
        "ç": "c",
        "Ç": "C",
        "—": "-",
        "–": "-",
        "•": "*",
        "“": '"',
        "”": '"',
        "’": "'",
        "‘": "'",
        "…": "...",
    }
)


def _pdf_safe(text: str) -> str:
    """Metni PDF Type1 Helvetica uyumlu ASCII karakterlere dönüştürür ve parantezleri kaçırır."""
    cleaned = (text or "").translate(_TR_MAP)
    ascii_only = cleaned.encode("ascii", errors="replace").decode("ascii")
    return ascii_only.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf_document(
    *,
    title: str,
    subtitle: str,
    summary_lines: list[str],
    sections: list[tuple[str, list[str]]],
    footer_note: str = "FactoryGuard Lite - Yalnizca Pasif OT Gozlem Raporu",
) -> bytes:
    """Başlık, yönetici özeti ve bölümlerden oluşan çok sayfalı A4 PDF (1.4) üretir."""
    # Her satır: (font_key, font_size, line_text, extra_gap_before)
    styled_lines: list[tuple[str, int, str, int]] = []

    styled_lines.append(("F2", 16, title, 0))
    styled_lines.append(("F1", 10, subtitle, 4))
    styled_lines.append(("F1", 9, "-" * 95, 6))

    if summary_lines:
        styled_lines.append(("F2", 12, "Yonetici Ozeti", 6))
        for line in summary_lines:
            for wrapped in textwrap.wrap(line, width=92) or [""]:
                styled_lines.append(("F1", 10, wrapped, 2))
        styled_lines.append(("F1", 9, "-" * 95, 6))

    for sec_title, sec_rows in sections:
        styled_lines.append(("F2", 12, sec_title, 8))
        if not sec_rows:
            styled_lines.append(("F1", 10, "Kayit bulunamadi.", 2))
            continue
        for row in sec_rows:
            for subline in row.splitlines():
                wrapped_list = textwrap.wrap(subline, width=92) or [""]
                for idx, wline in enumerate(wrapped_list):
                    font = "F2" if (idx == 0 and subline.startswith("[")) else "F1"
                    styled_lines.append((font, 9, wline, 2))
            styled_lines.append(("F1", 8, "", 2))

    # Sayfalama (A4: 595 x 842 pt)
    pages_commands: list[str] = []
    cur_cmds: list[str] = []
    y = 790

    def flush_page() -> None:
        nonlocal cur_cmds, y
        if cur_cmds:
            pages_commands.append("\n".join(cur_cmds))
            cur_cmds = []
        y = 790

    for font, size, text, gap in styled_lines:
        line_height = size + 4 + gap
        if y - line_height < 55:
            flush_page()
        y -= gap
        safe = _pdf_safe(text)
        cur_cmds.append(f"BT /{font} {size} Tf 45 {y} Td ({safe}) Tj ET")
        y -= size + 4

    if cur_cmds or not pages_commands:
        flush_page()

    total_pages = len(pages_commands)
    final_streams: list[bytes] = []
    for idx, cmds in enumerate(pages_commands, start=1):
        footer = _pdf_safe(f"{footer_note} | Sayfa {idx} / {total_pages}")
        page_stream = f"{cmds}\nBT /F1 8 Tf 45 30 Td ({footer}) Tj ET\n".encode("ascii")
        final_streams.append(page_stream)

    # Nesne numaraları:
    # 1: Catalog, 2: Pages, 3: Font F1 (Helvetica), 4: Font F2 (Helvetica-Bold)
    # Sonraki her sayfa için 2 nesne: (Page, ContentStream)
    objects: list[bytes] = []
    page_obj_ids: list[int] = []

    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"")  # 2 numaralı Pages nesnesi aşağıda doldurulacak
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    for stream_bytes in final_streams:
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_obj_ids.append(page_id)
        page_dict = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii")
        content_obj = (
            f"<< /Length {len(stream_bytes)} >>\nstream\n".encode("ascii")
            + stream_bytes
            + b"endstream"
        )
        objects.append(page_dict)
        objects.append(content_obj)

    kids_str = " ".join(f"{pid} 0 R" for pid in page_obj_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_obj_ids)} >>".encode("ascii")

    # PDF çıktısını birleştir ve xref tablosunu hesapla
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = []
    for obj_num, obj_body in enumerate(objects, start=1):
        offsets.append(len(out))
        out.extend(f"{obj_num} 0 obj\n".encode("ascii"))
        out.extend(obj_body)
        out.extend(b"\nendobj\n")

    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))

    out.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(out)
