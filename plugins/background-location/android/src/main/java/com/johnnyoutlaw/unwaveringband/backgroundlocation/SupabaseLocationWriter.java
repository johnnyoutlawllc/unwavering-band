package com.johnnyoutlaw.unwaveringband.backgroundlocation;

import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

final class SupabaseLocationWriter {
    private static final String TAG = "UBLocationWriter";
    private static final long MIN_INTERVAL_MS = 60_000L;
    private static final double MIN_DISTANCE_M = 50.0;

    private final SessionStore store;

    SupabaseLocationWriter(SessionStore store) {
        this.store = store;
    }

    boolean shouldUpload(double lat, double lng) {
        long lastAt = store.getLastUploadAt();
        long now = System.currentTimeMillis();
        if (lastAt == 0L) return true;
        if (now - lastAt >= MIN_INTERVAL_MS) return true;
        Double prevLat = store.getLastLat();
        Double prevLng = store.getLastLng();
        if (prevLat == null || prevLng == null) return true;
        return haversineM(prevLat, prevLng, lat, lng) >= MIN_DISTANCE_M;
    }

    void upload(double lat, double lng, float accuracyM) throws Exception {
        if (!store.hasSession()) {
            throw new IllegalStateException("No auth session stored for background location.");
        }
        String base = store.getSupabaseUrl().replaceAll("/$", "");
        String userId = store.getUserId();
        String visitedAt = Instant.now().toString();

        JSONObject visit = new JSONObject();
        visit.put("user_id", userId);
        visit.put("lat", lat);
        visit.put("lng", lng);
        visit.put("accuracy_m", accuracyM);
        visit.put("visited_at", visitedAt);
        request("POST", base + "/rest/v1/visits", visit.toString());

        JSONObject patch = new JSONObject();
        patch.put("last_lat", lat);
        patch.put("last_lng", lng);
        patch.put("last_location_accuracy_m", accuracyM);
        patch.put("last_location_at", visitedAt);
        patch.put("last_lat_cipher", JSONObject.NULL);
        patch.put("last_lng_cipher", JSONObject.NULL);
        request("PATCH", base + "/rest/v1/users?id=eq." + userId, patch.toString());

        store.rememberUpload(lat, lng, System.currentTimeMillis());
    }

    private void request(String method, String urlStr, String body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestMethod(method);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("apikey", store.getAnonKey());
        conn.setRequestProperty("Authorization", "Bearer " + store.getAccessToken());
        conn.setRequestProperty("Content-Profile", "unwavering");
        conn.setRequestProperty("Accept-Profile", "unwavering");
        conn.setRequestProperty("Prefer", "return=minimal");

        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bytes);
        }

        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            String err = "";
            try {
                if (conn.getErrorStream() != null) {
                    err = new String(conn.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
                }
            } catch (Exception ignored) {}
            Log.e(TAG, method + " " + urlStr + " -> " + code + " " + err);
            throw new IllegalStateException("Supabase " + method + " failed: HTTP " + code);
        }
        conn.disconnect();
    }

    static double haversineM(double aLat, double aLng, double bLat, double bLng) {
        double R = 6371000.0;
        double dLat = Math.toRadians(bLat - aLat);
        double dLng = Math.toRadians(bLng - aLng);
        double s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * R * Math.asin(Math.sqrt(s));
    }
}
