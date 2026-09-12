package com.johnnyoutlaw.unwaveringband.backgroundlocation;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundLocation",
    permissions = {
        @Permission(
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "background"
        ),
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notifications"
        )
    }
)
public class BackgroundLocationPlugin extends Plugin {
    private SessionStore store;

    @Override
    public void load() {
        store = new SessionStore(getContext());
        if (store.isTrackingEnabled() && store.hasSession()) {
            startService();
        }
    }

    @PluginMethod
    public void setAuthSession(PluginCall call) {
        String access = call.getString("accessToken");
        String userId = call.getString("userId");
        String url = call.getString("supabaseUrl");
        String anon = call.getString("supabaseAnonKey");
        if (access == null || userId == null || url == null || anon == null) {
            call.reject("accessToken, userId, supabaseUrl, and supabaseAnonKey are required");
            return;
        }
        store.saveSession(access, call.getString("refreshToken"), userId, url, anon);
        JSObject ret = new JSObject();
        ret.put("stored", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearAuthSession(PluginCall call) {
        stopService();
        store.clearSession();
        JSObject ret = new JSObject();
        ret.put("cleared", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("notifications", call, "permCallback");
            return;
        }
        if (!hasFineLocation()) {
            requestPermissionForAlias("location", call, "permCallback");
            return;
        }
        if (Build.VERSION.SDK_INT >= 29 && !hasBackgroundLocation()) {
            requestPermissionForAlias("background", call, "permCallback");
            return;
        }
        resolvePermissionStatus(call);
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        if (!hasFineLocation()) {
            resolvePermissionStatus(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= 29 && !hasBackgroundLocation()) {
            requestPermissionForAlias("background", call, "backgroundCallback");
            return;
        }
        resolvePermissionStatus(call);
    }

    @PermissionCallback
    private void backgroundCallback(PluginCall call) {
        resolvePermissionStatus(call);
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        if (!store.hasSession()) {
            call.reject("Call setAuthSession before startTracking");
            return;
        }
        if (!hasFineLocation()) {
            call.reject("Location permission not granted");
            return;
        }
        store.setTrackingEnabled(true);
        startService();
        JSObject ret = new JSObject();
        ret.put("tracking", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        store.setTrackingEnabled(false);
        stopService();
        JSObject ret = new JSObject();
        ret.put("tracking", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        resolvePermissionStatus(call);
    }

    private void resolvePermissionStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("tracking", store.isTrackingEnabled());
        ret.put("hasSession", store.hasSession());
        ret.put("permission", permissionLabel());
        call.resolve(ret);
    }

    private String permissionLabel() {
        if (!hasFineLocation()) return "denied";
        if (Build.VERSION.SDK_INT >= 29 && !hasBackgroundLocation()) return "whenInUse";
        return "always";
    }

    private boolean hasFineLocation() {
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED
            || ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackgroundLocation() {
        if (Build.VERSION.SDK_INT < 29) return true;
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void startService() {
        Intent intent = new Intent(getContext(), LocationTrackingService.class);
        intent.setAction(LocationTrackingService.ACTION_START);
        ContextCompat.startForegroundService(getContext(), intent);
    }

    private void stopService() {
        Intent intent = new Intent(getContext(), LocationTrackingService.class);
        intent.setAction(LocationTrackingService.ACTION_STOP);
        getContext().startService(intent);
    }
}
