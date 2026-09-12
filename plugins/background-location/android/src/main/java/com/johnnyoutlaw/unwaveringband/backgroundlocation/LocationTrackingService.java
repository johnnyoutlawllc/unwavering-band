package com.johnnyoutlaw.unwaveringband.backgroundlocation;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationTrackingService extends Service {
    public static final String ACTION_START = "com.johnnyoutlaw.unwaveringband.START_TRACKING";
    public static final String ACTION_STOP = "com.johnnyoutlaw.unwaveringband.STOP_TRACKING";
    private static final String CHANNEL_ID = "ub_location";
    private static final int NOTIFICATION_ID = 4201;
    private static final String TAG = "UBLocationService";

    private FusedLocationProviderClient fused;
    private LocationCallback callback;
    private SessionStore store;
    private SupabaseLocationWriter writer;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void onCreate() {
        super.onCreate();
        store = new SessionStore(this);
        writer = new SupabaseLocationWriter(store);
        fused = LocationServices.getFusedLocationProviderClient(this);
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }
        startAsForeground();
        startTracking();
        return START_STICKY;
    }

    private void startAsForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(
            this,
            0,
            launch != null ? launch : new Intent(this, BridgeActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Unwavering Band")
            .setContentText("Sharing your location in the background")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pi)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Background location",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps Unwavering Band location sharing alive while the app is in the background.");
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    private void startTracking() {
        if (callback != null) return;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 60_000L)
            .setMinUpdateIntervalMillis(30_000L)
            .setMinUpdateDistanceMeters(40f)
            .setWaitForAccurateLocation(false)
            .build();

        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc == null) return;
                maybeUpload(loc);
            }
        };

        try {
            fused.requestLocationUpdates(request, callback, Looper.getMainLooper());
            fused.getLastLocation().addOnSuccessListener(loc -> {
                if (loc != null) maybeUpload(loc);
            });
        } catch (SecurityException e) {
            Log.e(TAG, "Missing location permission", e);
            stopSelf();
        }
    }

    private void maybeUpload(Location loc) {
        double lat = loc.getLatitude();
        double lng = loc.getLongitude();
        float accuracy = loc.hasAccuracy() ? loc.getAccuracy() : 0f;
        if (!writer.shouldUpload(lat, lng)) return;
        executor.execute(() -> {
            try {
                writer.upload(lat, lng, accuracy);
            } catch (Exception e) {
                Log.e(TAG, "Upload failed", e);
            }
        });
    }

    private void stopTracking() {
        if (callback != null) {
            fused.removeLocationUpdates(callback);
            callback = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        stopTracking();
        executor.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
