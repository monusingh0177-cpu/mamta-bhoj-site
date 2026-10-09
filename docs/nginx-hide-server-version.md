# Hide the nginx version from response headers (production, manual)

Seobility and similar scanners flag `Server: nginx/1.24.0` because the version number helps an attacker pick
exploits. The Node app never sends a `Server` or `X-Powered-By` header (checked), so the header comes from
nginx on the Droplet and has to be fixed there. This is a server change, not a code change, so it is not part
of any deploy script. Do it by hand, once.

```bash
# 1. back up the config
sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak-$(date +%F)

# 2. see what is set now
sudo nginx -T 2>/dev/null | grep -n "server_tokens"

# 3. inside the http { ... } block of /etc/nginx/nginx.conf make sure this line exists and is not commented out
#       server_tokens off;
sudo nano /etc/nginx/nginx.conf

# 4. test, then reload (a reload does not drop connections; the Node app and PM2 are not touched)
sudo nginx -t && sudo systemctl reload nginx

# 5. verify
curl -sI https://devmamflourishfoods.com/ | grep -i '^server'      # expect: server: nginx   (no version)
```

Notes
- `server_tokens off;` only removes the version number. The header still says `nginx`; removing that too needs
  the third-party headers-more module and is not worth it.
- Do not change `proxy_read_timeout` or other timeouts as part of this.
- If the site config under `/etc/nginx/sites-enabled/` already sets `server_tokens`, change it there instead
  (a `server`-level value overrides the `http`-level one).
- Roll back with: `sudo cp -a /etc/nginx/nginx.conf.bak-<date> /etc/nginx/nginx.conf && sudo nginx -t && sudo systemctl reload nginx`.
