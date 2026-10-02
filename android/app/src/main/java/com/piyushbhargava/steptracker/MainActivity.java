package com.piyushbhargava.steptracker;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

// Requesting Google API scopes beyond sign-in (drive.appdata, for Drive backups — ST-020) makes
// Google show a consent screen as a separate activity. Its result arrives here and has to be
// handed back to the SocialLogin plugin; the marker interface tells the plugin this wiring exists.
// Guarded by scripts/android-main-activity.test.js.
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    // App-local plugins must be registered before the bridge is created: DriveAuthorization (ST-026)
    // and ApkUpdater (ST-028, in-app updates).
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriveAuthorizationPlugin.class);
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (plugin instanceof SocialLoginPlugin) {
                ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
            }
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
