package com.piyushbhargava.steptracker;

import android.accounts.Account;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

// ST-026: Drive access tokens without a sign-in. Google Play services' Authorization API returns a
// token for a scope the user already granted — with no UI — and renews it when it expires. The
// app calls it for every silent reconnect and before each Drive request, so a returning user never
// sees Credential Manager's "Signing in as…" sheet. It never shows UI itself: when Google needs the
// user again (access removed, account gone) it rejects with NEEDS_CONSENT and the app offers
// "Connect Google Drive". Guarded by scripts/android-main-activity.test.js.
@CapacitorPlugin(name = "DriveAuthorization")
public class DriveAuthorizationPlugin extends Plugin {

    private static final String GOOGLE_ACCOUNT_TYPE = "com.google";

    @PluginMethod
    public void authorize(PluginCall call) {
        List<Scope> scopes = new ArrayList<>();
        try {
            JSArray requested = call.getArray("scopes");
            if (requested != null) {
                for (String scope : requested.<String>toList()) {
                    scopes.add(new Scope(scope));
                }
            }
        } catch (JSONException e) {
            call.reject("Invalid scopes", "INVALID_ARGUMENT", e);
            return;
        }
        if (scopes.isEmpty()) {
            call.reject("At least one scope is required", "INVALID_ARGUMENT");
            return;
        }

        AuthorizationRequest.Builder request = AuthorizationRequest.builder().setRequestedScopes(scopes);
        String account = call.getString("account");
        if (account != null && !account.isEmpty()) {
            request.setAccount(new Account(account, GOOGLE_ACCOUNT_TYPE));
        }

        Identity.getAuthorizationClient(getActivity())
            .authorize(request.build())
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    call.reject("Google needs the user to grant Drive access again", "NEEDS_CONSENT");
                    return;
                }
                String token = result.getAccessToken();
                if (token == null || token.isEmpty()) {
                    call.reject("Google returned no access token", "NO_TOKEN");
                    return;
                }
                JSObject reply = new JSObject();
                reply.put("accessToken", token);
                call.resolve(reply);
            })
            .addOnFailureListener(e -> call.reject("Drive authorization failed: " + e.getMessage(), "AUTHORIZATION_FAILED", e));
    }
}
