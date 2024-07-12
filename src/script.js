const clientId = "8e6b7268c23646aba1fe6664756796f1";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

let token;
let userID;
let songURIs = [];

if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    token = await getAccessToken(clientId, code);
    const profile = await fetchProfile(token);
    setProfile(profile);
}

document.getElementById("getStats").addEventListener("click", getStats, false);
document.getElementById("makePlaylist").addEventListener("click", makePlaylist, false);

export async function redirectToAuthCodeFlow(clientId) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email user-top-read playlist-modify-public");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export async function getAccessToken(clientId, code) {
    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("code_verifier", verifier);

    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    const { access_token } = await result.json();
    token = access_token;
    return access_token;
}

async function fetchProfile(token) {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}

async function fetchStats(token, type, range, limit) {
    const result = await fetch(`https://api.spotify.com/v1/me/top/${type}?time_range=${range}&limit=${limit}`, {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}

function setProfile(profile) {
    document.getElementById("displayName").innerText = profile.display_name;
    userID = profile.id;
}

/**
 * Called when user clicks "get stats" button and returns stats based of the provided inputs
 */
async function getStats() {
    document.getElementById("stats").innerHTML = "";
    let type = document.getElementById("type").value;
    let range = document.getElementById("range").value;
    let limit = document.getElementById("limit").value;
    
    if ((limit <= 50 && limit > 0) || limit === "") { 
        const stats = await fetchStats(token, type, range, limit);
        document.getElementById("stats").innerHTML += `Top ${limit} ${type} (${range.replace("_", " ")})`;
        let i = 0;
        for (let item of stats.items) {
            document.getElementById("stats").innerHTML += `<br>\t${i + 1}: ${item.name}`;
            if (type === "tracks") document.getElementById("stats").innerHTML += ` - ${item.album.artists[0].name}`;
            songURIs[i] = item.uri;
            i++;
        }

        if (type === "tracks") {
            document.getElementById("makePlaylist").hidden = false;
        } else {
            document.getElementById("makePlaylist").hidden = true;
        }
    } else {
        document.getElementById("stats").innerHTML = "Limit needs to be between 1 and 50 inclusive."
    }
}

/**
 * Called when user clicks "make playlist" button and returns creates a new playlist with the returned songs
 */
async function makePlaylist() {
    let type = document.getElementById("type").value;
    let range = document.getElementById("range").value;
    let limit = document.getElementById("limit").value || 20;

    try {
        const playlist = await fetch(`https://api.spotify.com/v1/users/${userID}/playlists`, {
            method: "POST", 
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
                "name": `Top ${limit} ${type} (${range.replace("_", " ")})`,
                "description": "New Playlist Description",
                "public": true
            })
        });

        let playlistResponse = await playlist.json();

        const songsAdded = await fetch(`https://api.spotify.com/v1/playlists/${playlistResponse.id}/tracks`, {
            method: "POST", 
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "uris": songURIs,
                "position": 0
            })
        });
    } catch (error) {
        console.log(error)
    }
}