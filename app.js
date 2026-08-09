const CLIENT_ID = window.APP_CONFIG?.CLIENT_ID;
if (!CLIENT_ID) {
    throw new Error('Missing CLIENT_ID. Set VITE_CLIENT_ID in .env.local (see .env.example)');
}
const SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';

let tokenClient;
let accessToken = null;

window.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                document.getElementById('auth_btn').innerText = "Connected!";
                document.getElementById('fetch_btn').style.display = "inline-block";
            }
        },
    });
};

function requestToken() {
    tokenClient.requestAccessToken();
}

async function getStepsData() {
    if (!accessToken) return alert("Please connect your Google account first!");

    const fetchBtn = document.getElementById('fetch_btn');
    const streakDisplay = document.getElementById('streak-display');

    fetchBtn.disabled = true;
    fetchBtn.innerText = "Syncing Steps...";
    streakDisplay.innerHTML = "<h3>⏳ Syncing historical data in chunks...</h3>";

    const TOTAL_DAYS = 365; // Total days you want to analyze
    const CHUNK_DAYS = 30;  // Safe size per API call
    const msInDay = 24 * 60 * 60 * 1000;

    const now = new Date().getTime();
    let combinedBuckets = [];

    try {
        // Loop backwards from today in 30-day increments
        for (let offset = 0; offset < TOTAL_DAYS; offset += CHUNK_DAYS) {
            const chunkEnd = now - (offset * msInDay);
            const chunkStart = now - (Math.min(offset + CHUNK_DAYS, TOTAL_DAYS) * msInDay);

            streakDisplay.innerHTML = `<h3>⏳ Fetching days ${offset} to ${Math.min(offset + CHUNK_DAYS, TOTAL_DAYS)} ago...</h3>`;

            const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    aggregateBy: [{
                        dataTypeName: 'com.google.step_count.delta',
                        dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'
                    }],
                    bucketByTime: { durationMillis: 86400000 }, // 1-day buckets
                    startTimeMillis: chunkStart,
                    endTimeMillis: chunkEnd
                })
            });

            if (!response.ok) {
                throw new Error(`Google API Error: ${response.status}`);
            }

            const data = await response.json();

            // Combine buckets (newer chunks placed after older chunks)
            if (data.bucket) {
                combinedBuckets = [...(data.bucket || []), ...combinedBuckets];
            }
        }

        // Pass all stitched buckets to calculate the true streak
        parseAndCalculateStreak({ bucket: combinedBuckets });

    } catch (err) {
        console.error("Error fetching step data:", err);
        streakDisplay.innerHTML = `<h3 style="color:red">❌ Sync failed: ${err.message}</h3>`;
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerText = "Sync Steps";
    }
}

function parseAndCalculateStreak(data) {
    const dailyBuckets = data.bucket || [];
    let dailyTotals = [];

    dailyBuckets.forEach(bucket => {
        let steps = 0;
        if (bucket.dataset[0].point.length > 0) {
            steps = bucket.dataset[0].point[0].value[0].intVal || 0;
        }
        dailyTotals.push(steps);
    });

    const DAILY_STEP_GOAL = 3900; // ~3 km goal
    let currentStreak = 0;

    for (let i = dailyTotals.length - 1; i >= 0; i--) {
        if (dailyTotals[i] >= DAILY_STEP_GOAL) {
            currentStreak++;
        } else {
            break;
        }
    }

    document.getElementById('streak-display').innerHTML = `
    <h2>Current Streak: ${currentStreak} Days 🔥</h2>
  `;
    document.getElementById('output').textContent = JSON.stringify(dailyTotals, null, 2);
}