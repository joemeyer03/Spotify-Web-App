const clientId = "8e6b7268c23646aba1fe6664756796f1";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

let token;
let userID;
let songURIs = [];
let songIDs = [];

if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    token = await getAccessToken(clientId, code);
    const profile = await fetchProfile(token);
    setProfile(profile);
}

document.getElementById("getStats").addEventListener("click", getStats, false);
document.getElementById("makePlaylist").addEventListener("click", makePlaylist, false);
document.getElementById("showMore").addEventListener("click", showMore, false);

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

async function createPlaylist(token, userID, name, description, pubOrPriv) {
    const result = await fetch(`https://api.spotify.com/v1/users/${userID}/playlists`, {
        method: "POST", 
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
            "name": name,
            "description": description,
            "public": pubOrPriv
        })
    });

    return await result.json();
}

async function addToPlaylist(token, playlistID, songURIs, position) {
    const result = await fetch(`https://api.spotify.com/v1/playlists/${playlistID}/tracks`, {
        method: "POST", 
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            "uris": songURIs,
            "position": position
        })
    });

    return await result.json()
}

async function getTrackFeatures(token, trackID) {
    const result = await fetch(`https://api.spotify.com/v1/audio-features/${trackID}`, {
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
    // reset page
    document.getElementById("stats").innerHTML = "";
    document.getElementById("moreResults").innerHTML = "";
    document.getElementById("moreResults").hidden = true;
    document.getElementById("showMore").innerText = "Show More";
    
    let type = document.getElementById("type").value;
    let range = document.getElementById("range").value;
    let limit = document.getElementById("limit").value || 20;
    
    if (limit <= 50 && limit > 0) { 
        const stats = await fetchStats(token, type, range, limit);
        document.getElementById("stats").innerHTML += `Top ${limit} ${type} (${range.replace("_", " ")})`;
        let i = 0;
        if (document.getElementById("sort").value === "worldPop") stats.items = stats.items.sort(function(a, b) {return b.popularity - a.popularity});
        for (let item of stats.items) {
            document.getElementById("stats").innerHTML += `<br>\t${i + 1}: ${item.name}`;
            if (type === "tracks") document.getElementById("stats").innerHTML += ` - ${item.album.artists[0].name}`;
            if (document.getElementById("sort").value === "worldPop") document.getElementById("stats").innerHTML += ` - popularity: ${item.popularity}`
            songURIs[i] = item.uri;
            songIDs[i] = item.id;
            i++;
        }

        if (type === "tracks") {
            document.getElementById("makePlaylist").hidden = false;
            document.getElementById("showMore").hidden = false;
        } else {
            document.getElementById("makePlaylist").hidden = true;
            document.getElementById("showMore").hidden = false;
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
        const playlist = await createPlaylist(token, userID, `Top ${limit} ${type} (${range.replace("_", " ")})`, "New Playlist Description", true);
        const songsAdded = await addToPlaylist(token, playlist.id, songURIs, 0); 
    } catch (error) {
        console.log(error)
    }
}

async function showMore() {
    if (document.getElementById("showMore").innerText === "Show More") {
        document.getElementById("showMore").innerText = "Show Less";
        let acousticness = 0, danceability = 0, energy = 0, tempo = 0, valence = 0;
        let limit = document.getElementById("stats").innerText.split(" ")[1];

        for (let id of songIDs) {
            const songStats = await getTrackFeatures(token, id);
            acousticness += songStats.acousticness, danceability += songStats.danceability, energy += songStats.energy, tempo += songStats.tempo, valence += songStats.valence;
        }

        document.getElementById("moreResults").innerHTML = 
                `Acousticness: ${Math.round(acousticness/limit*100)}%<br>
                Danceability: ${Math.round(danceability/limit*100)}%<br>
                Energy: ${Math.round(energy/limit*100)}%<br>
                Tempo: ${Math.round(tempo/limit)} bpm<br>
                Valence: ${Math.round(valence/limit*100)}%<br>`
        document.getElementById("moreResults").hidden = false;
    } else {
        document.getElementById("showMore").innerText = "Show More";
        document.getElementById("moreResults").hidden = true;
    }
}