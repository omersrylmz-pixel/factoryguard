"""Kanıta dayalı cihaz sınıflandırma yardımcısı (Bölüm 4.2).

İlkeler:
1. Yeterli kanıt yoksa cihazı tahmin ederek kesin bir üretici veya model bilgisi VERME.
2. Yalnızca bir IP ve MAC adresinden cihazın "Siemens PLC" olduğunu söyleme.
3. Bunun yerine:
   - "Bilinmeyen cihaz"
   - "Muhtemel endüstriyel cihaz"
   - "Üretici bilgisi doğrulanmadı"
   gibi güvenilir, kanıta dayalı ifadeler üret.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

INDUSTRIAL_PROTOCOLS = {"modbus", "s7comm", "enip", "cip", "opcua", "dnp3", "bacnet", "profinet"}

# IEEE MAC OUI (ilk 3 bayt) -> Endüstriyel donanım üreticisi ipucu sözlüğü (pasif, kanıta dayalı)
INDUSTRIAL_OUI_VENDORS: dict[str, str] = {
    "00:1b:1b": "Siemens AG",
    "00:0e:8c": "Siemens AG",
    "28:63:36": "Siemens AG",
    "00:00:bc": "Rockwell Automation (Allen-Bradley)",
    "f4:54:33": "Rockwell Automation (Allen-Bradley)",
    "00:80:f4": "Schneider Electric (Modicon)",
    "00:00:54": "Schneider Electric",
    "00:a0:45": "Phoenix Contact",
    "00:01:05": "Beckhoff Automation",
    "00:30:de": "WAGO Kontakttechnik",
    "00:90:e8": "Moxa Technologies",
    "00:e0:4b": "Advantech Industrial",
    "00:d0:c9": "Hirschmann Automation",
}


def lookup_mac_oui_vendor(mac: str | None) -> str | None:
    """MAC adresinin ilk 3 oktetinden (OUI) pasif endüstriyel üretici ipucunu döndürür."""
    if not mac or len(mac) < 8:
        return None
    prefix = mac.strip().lower().replace("-", ":")[:8]
    return INDUSTRIAL_OUI_VENDORS.get(prefix)


ASSET_TYPE_TR: dict[str, str] = {
    "plc": "PLC",
    "hmi": "HMI",
    "scada_server": "SCADA Sunucusu",
    "industrial_pc": "Endüstriyel PC",
    "network_device": "Ağ Cihazı",
    "engineering_workstation": "Mühendislik İstasyonu",
    "server": "Sunucu",
    "computer": "Bilgisayar",
    "unknown_device": "Bilinmeyen Cihaz",
}

_HOSTNAME_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|[-_.])(plc|rtu)([-_.\d]|$)", re.I), "plc"),
    (re.compile(r"(^|[-_.])(hmi|panel|op\d+)([-_.\d]|$)", re.I), "hmi"),
    (re.compile(r"(^|[-_.])(scada|hist|historian)([-_.\d]|$)", re.I), "scada_server"),
    (re.compile(r"(^|[-_.])(ipc)([-_.\d]|$)", re.I), "industrial_pc"),
    (re.compile(r"(^|[-_.])(ew|eng|ews|workstation)([-_.\d]|$)", re.I), "engineering_workstation"),
    (re.compile(r"(^|[-_.])(sw|switch|fw|firewall|gw|router)([-_.\d]|$)", re.I), "network_device"),
    (re.compile(r"(^|[-_.])(srv|server|dc\d*)([-_.\d]|$)", re.I), "server"),
]


@dataclass(frozen=True)
class ClassificationHint:
    inferred_type: str  # ASSET_TYPES içinden
    confidence: float
    classification_label: str
    vendor_status_label: str
    reasons: list[str]


def infer_from_evidence(
    *,
    current_type: str,
    is_verified: bool,
    vendor: str | None,
    hostname: str | None,
    observed_protocols: list[str],
    base_confidence: float,
    mac_address: str | None = None,
) -> ClassificationHint:
    """Mevcut kanıtlara göre cihazın sınıflandırma etiketini ve güven seviyesini hesaplar."""
    reasons: list[str] = []
    protos = {p.lower().rstrip("?") for p in observed_protocols if p and not p.endswith("?")}
    ot_protos = sorted(protos & INDUSTRIAL_PROTOCOLS)

    if ot_protos:
        reasons.append(f"Gözlemlenen endüstriyel protokol: {', '.join(ot_protos)}")

    oui_hint = lookup_mac_oui_vendor(mac_address)
    if oui_hint and not is_verified:
        reasons.append(f"Pasif MAC OUI donanım ipucu: {oui_hint} (Doğrulanmadı)")

    inferred_type = current_type
    confidence = base_confidence

    if not is_verified and current_type == "unknown_device" and hostname:
        for pattern, candidate in _HOSTNAME_RULES:
            if pattern.search(hostname):
                inferred_type = candidate
                confidence = max(confidence, 0.65)
                reasons.append(f"Hostname deseni eşleşti ({hostname} → {ASSET_TYPE_TR[candidate]})")
                break

    # Kullanıcı tarafından doğrulandıysa kesin etiket göster
    if is_verified:
        label = f"{ASSET_TYPE_TR.get(inferred_type, 'Cihaz')} (Doğrulandı)"
        confidence = 1.0
        reasons.append("Kullanıcı tarafından manuel olarak doğrulandı")
    elif inferred_type != "unknown_device":
        label = f"Muhtemel {ASSET_TYPE_TR.get(inferred_type, inferred_type)} (Doğrulanmadı)"
    elif ot_protos:
        label = f"Muhtemel endüstriyel cihaz ({', '.join(p.upper() for p in ot_protos)} gözlendi)"
        confidence = max(confidence, 0.55)
    else:
        label = "Bilinmeyen cihaz"

    if vendor and is_verified:
        vendor_label = vendor
    elif vendor and not is_verified:
        vendor_label = f"{vendor} (Doğrulanmadı)"
    else:
        vendor_label = "Üretici bilgisi doğrulanmadı"

    if not reasons:
        reasons.append("Yalnızca pasif ağ adres bilgisi mevcut; tür/üretici için ek kanıt veya doğrulama gerekiyor")

    return ClassificationHint(
        inferred_type=inferred_type,
        confidence=round(min(confidence, 1.0), 2),
        classification_label=label,
        vendor_status_label=vendor_label,
        reasons=reasons,
    )
