# webanalyze (Radar tech scan)

Local Wappalyzer-style CLI used when `RADAR_WEBANALYZE_BIN` is set. Without it, Radar falls back to HTML fingerprints (Litium, Norce, Optimizely, Shopify, Centra, WordPress, WooCommerce).

## Local setup (Windows)

1. Download [webanalyze_Windows_x86_64.zip](https://github.com/rverton/webanalyze/releases/latest) into this folder and extract `webanalyze.exe`.
2. Refresh definitions:

```powershell
cd tools\webanalyze
.\webanalyze.exe -update
```

3. In `.env.local`:

```
RADAR_WEBANALYZE_BIN=C:/Projects/roveplanner/tools/webanalyze/webanalyze.exe
RADAR_WEBANALYZE_APPS=C:/Projects/roveplanner/tools/webanalyze/technologies.json
```

4. Restart `npm run dev`.

Cloud Run images install the Linux binary and `technologies.json` in the Dockerfile.
