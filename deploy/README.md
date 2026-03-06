# Deployment: pos.BearlyUsed.net

Virtualmin 8.1 Professional, Ubuntu Server 24.04 LTS.

## Server Layout

```
/home/bearlyused/domains/pos.bearlyused.net/
  app/                    <- git clone of TireShopPOS (repo root)
    .env                  <- production credentials (chmod 600)
    app/Core/             <- PHP framework classes
    php/                  <- business logic (NOT web-accessible)
    routes/               <- API route definitions
    config/               <- app/database config files
    sql/                  <- schema and migrations
    frontend/dist/        <- Vite build output (copied to public_html)
    scripts/              <- cron job scripts
    storage/logs/         <- application logs
    deploy/               <- this directory
  public_html/            <- Apache document root (web-accessible)
    .htaccess             <- SPA + API routing rules
    index.html            <- React SPA entry point
    assets/               <- Vite-built JS/CSS/fonts
    api/
      index.php           <- PHP front controller (points to ../app/)
    uploads/
      .htaccess           <- blocks PHP execution
      photos/             <- tire photos (writable by PHP-FPM)
  backups/
    db/                   <- daily mysqldump output
```

## Key Principle

Everything outside `public_html/` is NOT web-accessible. The PHP source
code, SQL files, .env credentials, and business logic all live in `app/`
which Apache cannot serve directly. Only `api/index.php` bridges into
the app layer, and only through the PHP-FPM socket.

## Files in This Directory

| File | Deploys to | Purpose |
|------|-----------|---------|
| `deploy.sh` | run from server | Clone, build, deploy, init DB |
| `api-index.php` | `public_html/api/index.php` | PHP front controller wrapper |
| `htaccess` | `public_html/.htaccess` | SPA + API routing, security headers |
| `uploads-htaccess` | `public_html/uploads/.htaccess` | Block PHP in uploads |
| `.env.production.example` | `app/.env` (fill in creds) | Production config template |
| `.env.production` | (gitignored, local only) | Actual credentials |

## First Deploy

```bash
# SSH into server as bearlyused user
ssh bearlyused@pos.bearlyused.net

# Clone and deploy
git clone https://github.com/gjdunga/TireShopPOS.git /home/bearlyused/domains/pos.bearlyused.net/app
cd /home/bearlyused/domains/pos.bearlyused.net/app

# Create production .env with real credentials
cp deploy/.env.production.example deploy/.env.production
nano deploy/.env.production   # fill in DB_USERNAME, DB_PASSWORD

# Run deployment
chmod +x deploy/deploy.sh
./deploy/deploy.sh --init
```

## Updates

```bash
cd /home/bearlyused/domains/pos.bearlyused.net/app
./deploy/deploy.sh
```

## Virtualmin PHP-FPM Adjustment

After first deploy, expand `open_basedir` so PHP can read files
outside `public_html`. In Virtualmin: select the domain, go to
**Web Configuration > PHP Options**, find `open_basedir` and set:

```
/home/bearlyused/:/tmp/
```

Or edit the pool config directly:
```
/etc/php/8.3/fpm/pool.d/<pos-pool>.conf
```

Then restart: `sudo systemctl restart php8.3-fpm`
