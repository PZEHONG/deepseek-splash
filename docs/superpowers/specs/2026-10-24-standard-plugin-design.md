# Standard splash plugin

Selected approach: an installable DSH bundle, using the Host's `webserver/index-inject` event to draw the existing animation inside the application window. This replaces the need to patch Electron for new users. The existing native patch remains available for existing installations.

Goals: install from the repository URL and restart; reuse the 4K WebM and artwork; show during frontend initialization; close on UI readiness, Escape, skip button, media failure, reduced motion or a 15-second deadline. Do not modify user data or Electron files. Disabling the bundle removes future injections.

Approaches considered: standard page injection (selected by user) versus a native shell patch (earlier standalone window, but tied to application versions). A plugin cannot cover the interval before the Host provides the first page.

Implementation choice: framework-free JavaScript with a shadow DOM overlay; assets served through Connection Fetch routes, which support both desktop and Web. No build/install lifecycle scripts or runtime dependencies. Reuse the existing HTML styles and video without re-encoding. GitHub installation requires the changes to be published to the repository.
