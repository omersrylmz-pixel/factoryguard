"""Merkezi ve değiştirilebilir 100 puanlık risk puanlama modeli (Bölüm 4.5).

ÖNEMLİ NOT:
Bu puanlama modeli bir endüstri standardı değildir; FactoryGuard Lite'ın ilk ürün hipotezidir
ve teknik ekibin bulguları anlaşılır şekilde önceliklendirmesi için tasarlanmıştır.

Ağırlık dağılımı (Toplam = 100 puan):
  - Üretim kritiklik seviyesi: 30 puan
  - Ağ erişilebilirliği ve maruziyet: 25 puan
  - Doğrulanmış güvenlik açığı: 25 puan
  - Beklenmeyen davranış veya iletişim: 10 puan
  - Envanter ve sahiplik eksikliği: 10 puan
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskScoringWeights:
    production_criticality_max: int = 30
    network_exposure_max: int = 25
    verified_vulnerability_max: int = 25
    unexpected_behavior_max: int = 10
    inventory_gap_max: int = 10


DEFAULT_WEIGHTS = RiskScoringWeights()

CRITICALITY_POINTS: dict[str, int] = {
    "low": 8,
    "medium": 15,
    "high": 23,
    "critical": 30,
}


@dataclass(frozen=True)
class RiskScoreResult:
    score: int  # 0..100
    severity: str  # low | medium | high | critical
    breakdown: dict[str, int]


def score_to_severity(score: int) -> str:
    if score >= 75:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


def calculate_risk_score(
    *,
    asset_criticality: str,
    network_exposure_ratio: float = 0.0,
    verified_vuln_cvss: float | None = None,
    has_unexpected_behavior: bool = False,
    has_inventory_gap: bool = False,
    weights: RiskScoringWeights = DEFAULT_WEIGHTS,
) -> RiskScoreResult:
    """5 bileşenden açıklanabilir risk puanı (0–100) ve kırılımını hesaplar.

    Bulgu güven seviyesi (`confidence`) bu puandan ayrı tutulur.
    """
    crit_pts = min(
        CRITICALITY_POINTS.get(asset_criticality, 15),
        weights.production_criticality_max,
    )
    exposure_pts = round(
        max(0.0, min(1.0, network_exposure_ratio)) * weights.network_exposure_max
    )
    if verified_vuln_cvss is not None and verified_vuln_cvss > 0:
        vuln_pts = round(
            min(verified_vuln_cvss / 10.0, 1.0) * weights.verified_vulnerability_max
        )
    else:
        vuln_pts = 0

    behavior_pts = weights.unexpected_behavior_max if has_unexpected_behavior else 0
    inventory_pts = weights.inventory_gap_max if has_inventory_gap else 0

    total = min(100, crit_pts + exposure_pts + vuln_pts + behavior_pts + inventory_pts)
    breakdown = {
        "production_criticality": crit_pts,
        "network_exposure": exposure_pts,
        "verified_vulnerability": vuln_pts,
        "unexpected_behavior": behavior_pts,
        "inventory_gap": inventory_pts,
        "total": total,
    }
    return RiskScoreResult(
        score=total,
        severity=score_to_severity(total),
        breakdown=breakdown,
    )
