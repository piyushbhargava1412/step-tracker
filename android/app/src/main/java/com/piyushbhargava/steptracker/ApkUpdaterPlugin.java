package com.piyushbhargava.steptracker;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// ST-028: Settings › App › Install. Downloads a release APK from GitHub and hands it to Android's
// package installer, which asks the user to confirm and updates in place (same signing key, data
// kept). A sideloaded app can't update itself silently. Guarded by scripts/release-management.test.js.
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !isTrustedUrl(url)) {
            call.reject("Not a GitHub download link.", "INVALID_ARGUMENT");
            return;
        }

        // Installing needs a one-time "Install unknown apps" switch for this app. Check before
        // downloading, and send the user to that switch if it's off.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Allow installs from Step Tracker, then tap Install again.", "INSTALL_PERMISSION");
            return;
        }

        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Couldn't create the download folder.");
                File apk = new File(dir, "step-tracker-update.apk");
                download(url, apk);

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, APK_MIME_TYPE);
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed.", "DOWNLOAD_FAILED", e);
            }
        }).start();
    }

    // Release assets redirect from github.com to GitHub's download host; HttpURLConnection follows
    // https→https redirects itself.
    private static boolean isTrustedUrl(String url) {
        try {
            URL u = new URL(url);
            String host = u.getHost();
            return "https".equals(u.getProtocol()) && host.equals("github.com");
        } catch (Exception e) {
            return false;
        }
    }

    private static void download(String url, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new Exception("Download failed (HTTP " + status + ").");
            }
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            }
        } finally {
            connection.disconnect();
        }
    }
}
