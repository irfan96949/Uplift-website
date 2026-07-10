# Uplift Career Institute

## Teacher homework portal

The website must run on a Node.js host for teacher login, homework uploads, and attachments to work. GitHub Pages is static hosting and cannot run this server.

### Run on your computer

In PowerShell, open the `Uplift-website-main` folder and run:

```powershell
$env:ADMIN_USER = "teacher"
$env:ADMIN_PASSWORD = "choose-a-long-private-password"
$env:COOKIE_SECURE = "false"
node server.js
```

Then open `http://localhost:3000/admin.html`, sign in with those two values, and add homework. Students see it at `http://localhost:3000`.

### Deploy online

Deploy this `Uplift-website-main` folder to a Node.js host with persistent disk storage. Set the start command to `npm start`, and add these Environment Variables in the host dashboard:

```text
ADMIN_USER=teacher
ADMIN_PASSWORD=your-long-private-password
COOKIE_SECURE=true
```

Use the resulting site address for both the public site and `/admin.html`. Do not publish or commit the real password.
