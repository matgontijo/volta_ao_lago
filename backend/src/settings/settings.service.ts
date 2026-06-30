import { Injectable } from '@nestjs/common';

export interface RaceSettings {
  geofenceRadiusM: number;
}

/** Configurações de prova ajustáveis ao vivo pela coordenação. */
@Injectable()
export class SettingsService {
  private settings: RaceSettings = {
    geofenceRadiusM: Number(process.env.GEOFENCE_RADIUS_M ?? 350),
  };

  get(): RaceSettings {
    return { ...this.settings };
  }

  update(patch: Partial<RaceSettings>): RaceSettings {
    if (patch.geofenceRadiusM != null && Number.isFinite(Number(patch.geofenceRadiusM))) {
      this.settings.geofenceRadiusM = Math.max(50, Math.min(5000, Number(patch.geofenceRadiusM)));
    }
    return this.get();
  }
}
