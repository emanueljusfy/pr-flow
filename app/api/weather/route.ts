import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchWeatherForecast, type WeatherReading } from "@/modules/prs/lib/core/open-meteo-weather";
import { createServerCache } from "@/modules/server-cache/lib/server-cache";

const weatherQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lon: z.coerce.number().finite().min(-180).max(180)
});

// Keyed by ~1 km grid; Open-Meteo updates hourly at best.
const weatherCache = createServerCache<WeatherReading>({
  name: "weather:forecast",
  ttlMs: 10 * 60_000,
  staleTtlMs: 2 * 60 * 60_000,
  maxEntries: 20
});

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = weatherQuerySchema.safeParse({
    lat: searchParams.get("lat") ?? undefined,
    lon: searchParams.get("lon") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Coordenadas invalidas." }, { status: 400 });
  }

  const latitude = roundCoord(parsed.data.lat);
  const longitude = roundCoord(parsed.data.lon);

  try {
    const forecast = await weatherCache.get(`${latitude},${longitude}`, () =>
      fetchWeatherForecast({ latitude, longitude })
    );
    return NextResponse.json(forecast);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao buscar previsao do tempo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
