# Local and cloud service switching

The user requires browser use away from their PC as well as local operation, with both service options retained. The same UI connects to its current Gateway and lets a person explicitly choose demo, local Ollama or a configured cloud API. A switch creates a fresh session and cancels old inference/recording/playback. Memories and notes are isolated in per-service SQLite stores, preserving the existing assistant/companion split. No local history is silently uploaded or copied when switching to cloud.

Approaches considered: running an LLM inside Render would require a suitable compute plan/model installation; calling a configured HTTPS API needs only the existing web server. We implement the latter as the cloud option and preserve Ollama on loopback as the local option. These are implementation choices, not a claim that the user selected a paid provider. API credentials remain on the server; exact model/base URL are operator configuration. No paid account or API request is made during validation.

A usable original SVG avatar is shipped in both builds, labeled as the basic avatar rather than Live2D. The licensed Live2D adapter remains optional. Its assets are served at /avatar-local from an explicitly configured server directory so the identical browser path works on a local host or Render; private assets remain excluded from Git and Docker context. Live2D model/Core assets have not been supplied, so real Live2D rendering cannot yet be validated.

The UI explains that local Ollama belongs to the computer running this Gateway, and that cloud prompts/memories are transmitted to the configured provider. Visiting the Render site never automatically connects to a Windows loopback service. For local native use open the local Gateway; for remote use open the Render Gateway. Both can use cloud APIs if configured.

Existing optional local speech providers remain intact; new cloud speech, email/calendar tooling and automatic history migration are out of scope. The user's own key/model and licensed assets are pending; until configured, the service selector explains unavailable options and does not silently fall back.
