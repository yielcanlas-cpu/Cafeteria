# MCC Canteen - security add-on

Everything here is NEW. No existing page, script, style, SQL or PHP file was edited.

## Install (about 1 minute)
1. Laragon running (Apache + MySQL). Project in `C:\laragon\www\Mcc-Canteen\`.
2. On the server computer open: http://localhost/Mcc-Canteen/security/install.php
3. Press **Install security**. It tests the site by itself and puts the old setting back if anything looks wrong.
4. If it lists accounts with a *default password*, press **Change them now** (security/set-password.php).

The only existing file it touches is `.htaccess`: a marked block is ADDED at the end (backup:
`.htaccess.pre-security.bak`). **Remove** deletes the block again.

## What it protects
| Problem | Protection |
|---|---|
| Anyone on the network could open `reset-owner-password.php` and take over the owner account | One-time scripts (and `_unused/`) work from the server computer only |
| `config.php`, `db.php`, `canteen.sql`, `README.md`, `.git`, `.user.ini` downloadable | Blocked (403 / 404) |
| Unlimited password guessing | 5 wrong tries per account per computer -> 15 min wait; 30 per computer. Also limits for sign-up and contact spam |
| Another website tricking a logged-in browser (CSRF) | Same-origin check, JSON-only POST, change-actions must be POST |
| Database error text shown to visitors (`DEBUG = true`) | Generic message for other computers; you still see details on localhost |
| Session cookie | HttpOnly, SameSite=Lax, strict mode, Secure on HTTPS |
| No browser protections | CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS (HTTPS only), directory listing off |
| Passwords only changeable by editing `config.php` | `security/set-password.php` (12+ characters, localhost only) |

## Limits (these would need edits to existing files, which was off the table)
- `config.php` still contains the MySQL **root user with no password** and the default passwords in plain text. Create a MySQL user with a password and put it in `config.php` before going online. Passwords changed with set-password.php are safe, but the old text stays in the file.
- Set `DEBUG = false` in `config.php` when real users use the site.
- Use HTTPS when the site is on the internet.
- A login lock only counts per computer, so one attacker cannot lock the real owner out, but a spread-out attack from many computers is not stopped.
- The CSP allows inline scripts because some pages use them.

## If something goes wrong
Press **Remove** on install.php, or restore `.htaccess.pre-security.bak` over `.htaccess`, or delete the block between
`# BEGIN MCC-SECURITY` and `# END MCC-SECURITY`.
