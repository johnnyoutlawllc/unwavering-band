package com.johnnyoutlaw.unwaveringband.backgroundlocation;

import android.content.Context;
import android.content.SharedPreferences;

final class SessionStore {
    private static final String PREFS = "ub_background_location";
    private static final String KEY_ACCESS = "access_token";
    private static final String KEY_REFRESH = "refresh_token";
    private static final String KEY_USER = "user_id";
    private static final String KEY_URL = "supabase_url";
    private static final String KEY_ANON = "supabase_anon_key";
    private static final String KEY_TRACKING = "tracking_enabled";
    private static final String KEY_LAST_LAT = "last_lat";
    private static final String KEY_LAST_LNG = "last_lng";
    private static final String KEY_LAST_AT = "last_upload_at";

    private final SharedPreferences prefs;

    SessionStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void saveSession(String accessToken, String refreshToken, String userId, String supabaseUrl, String anonKey) {
        prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken == null ? "" : refreshToken)
            .putString(KEY_USER, userId)
            .putString(KEY_URL, supabaseUrl)
            .putString(KEY_ANON, anonKey)
            .apply();
    }

    void clearSession() {
        prefs.edit()
            .remove(KEY_ACCESS)
            .remove(KEY_REFRESH)
            .remove(KEY_USER)
            .remove(KEY_URL)
            .remove(KEY_ANON)
            .putBoolean(KEY_TRACKING, false)
            .apply();
    }

    boolean hasSession() {
        String access = prefs.getString(KEY_ACCESS, null);
        String user = prefs.getString(KEY_USER, null);
        String url = prefs.getString(KEY_URL, null);
        String anon = prefs.getString(KEY_ANON, null);
        return access != null && !access.isEmpty()
            && user != null && !user.isEmpty()
            && url != null && !url.isEmpty()
            && anon != null && !anon.isEmpty();
    }

    String getAccessToken() { return prefs.getString(KEY_ACCESS, ""); }
    String getUserId() { return prefs.getString(KEY_USER, ""); }
    String getSupabaseUrl() { return prefs.getString(KEY_URL, ""); }
    String getAnonKey() { return prefs.getString(KEY_ANON, ""); }

    void setTrackingEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_TRACKING, enabled).apply();
    }

    boolean isTrackingEnabled() {
        return prefs.getBoolean(KEY_TRACKING, false);
    }

    void rememberUpload(double lat, double lng, long atMs) {
        prefs.edit()
            .putString(KEY_LAST_LAT, String.valueOf(lat))
            .putString(KEY_LAST_LNG, String.valueOf(lng))
            .putLong(KEY_LAST_AT, atMs)
            .apply();
    }

    long getLastUploadAt() {
        return prefs.getLong(KEY_LAST_AT, 0L);
    }

    Double getLastLat() {
        String v = prefs.getString(KEY_LAST_LAT, null);
        if (v == null) return null;
        try { return Double.parseDouble(v); } catch (NumberFormatException e) { return null; }
    }

    Double getLastLng() {
        String v = prefs.getString(KEY_LAST_LNG, null);
        if (v == null) return null;
        try { return Double.parseDouble(v); } catch (NumberFormatException e) { return null; }
    }
}
