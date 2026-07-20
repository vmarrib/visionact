/**
 * Ponto Inteligente — amostra de obtenção de geolocalização no navegador.
 *
 * A posição do funcionário vem inteiramente da Geolocation API nativa do
 * navegador (`navigator.geolocation`) — sem SDK de mapas nem serviço pago de
 * localização no client. O geofencing (ver `geofence.ts`) só recebe a
 * coordenada já validada por este módulo.
 *
 * Decisões de configuração e por quê:
 *
 * - `enableHighAccuracy: true` força o dispositivo a usar GPS em vez de
 *   triangulação por rede/Wi-Fi sempre que disponível — mais lento e mais
 *   caro de bateria, mas necessário quando o raio de tolerância do
 *   geofence é da ordem de dezenas de metros: a precisão por rede (às
 *   vezes centenas de metros de erro) inviabilizaria a checagem.
 * - `timeout` finito: sem um limite, uma tentativa de bater ponto dentro de
 *   um prédio (sinal de GPS ruim) travaria esperando indefinidamente.
 * - `maximumAge: 0`: sempre pedir uma leitura fresca, nunca reaproveitar uma
 *   posição em cache do navegador — para uma checagem de presença no
 *   momento exato da batida, uma posição de minutos atrás não serve.
 */

export interface GeoReading {
  latitude: number;
  longitude: number;
  /** Raio de incerteza da leitura, em metros — ver uso em `isReadingReliable`. */
  accuracyMeters: number;
  capturedAt: Date;
}

export type GeoAcquisitionError =
  | "permission_denied"
  | "position_unavailable"
  | "timeout";

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

/**
 * Solicita uma leitura de posição única no momento da batida de ponto.
 *
 * Por que uma Promise ao redor de uma API baseada em callback? A
 * Geolocation API nativa (`getCurrentPosition(success, error)`) é anterior
 * a Promises no browser — encapsular numa Promise permite usar
 * `await` no restante do fluxo de batida de ponto sem misturar estilos de
 * callback e async/await no mesmo componente.
 */
export function getCurrentPosition(): Promise<GeoReading | { error: GeoAcquisitionError }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ error: "position_unavailable" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp),
        });
      },
      (error) => {
        resolve({ error: mapGeolocationError(error) });
      },
      GEOLOCATION_OPTIONS,
    );
  });
}

function mapGeolocationError(error: GeolocationPositionError): GeoAcquisitionError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "permission_denied";
    case error.TIMEOUT:
      return "timeout";
    default:
      return "position_unavailable";
  }
}

/** Acima disso, a leitura é considerada imprecisa demais para uma decisão de geofence confiável. */
const MAX_ACCEPTABLE_ACCURACY_METERS = 75;

/**
 * Decide se uma leitura é precisa o suficiente para basear uma decisão de
 * geofence nela.
 *
 * Por que checar a precisão em vez de só confiar em lat/long? O GPS de um
 * celular retorna um raio de incerteza junto com a coordenada — dentro de
 * um prédio ou em área urbana densa, esse raio pode passar de 100 metros,
 * maior que o próprio raio de tolerância de muitos locais autorizados. Sem
 * essa checagem, uma leitura ruim poderia aprovar (ou reprovar) uma batida
 * por sorte de arredondamento, não por presença real confirmada.
 */
export function isReadingReliable(reading: GeoReading): boolean {
  return reading.accuracyMeters <= MAX_ACCEPTABLE_ACCURACY_METERS;
}

/**
 * Mensagem específica por tipo de falha — importante em campo, onde o
 * funcionário (não um desenvolvedor) precisa entender o que fazer a
 * seguir (ex.: "ative a localização" é uma ação; "erro desconhecido" não é).
 */
export function describeAcquisitionError(error: GeoAcquisitionError): string {
  switch (error) {
    case "permission_denied":
      return "Permissão de localização negada. Ative o acesso à localização para bater o ponto.";
    case "timeout":
      return "Não foi possível obter sua localização a tempo. Tente novamente em uma área aberta.";
    case "position_unavailable":
      return "Localização indisponível neste dispositivo.";
  }
}
