# Deploying the FoodExpress backend to AWS EC2

Step-by-step deployment of the Django backend (gunicorn behind nginx, PostgreSQL)
on an Ubuntu EC2 instance.

## Files in this folder
- `gunicorn.service` — systemd unit; copy to `/etc/nginx/.../gunicorn.service`
- `nginx-foodexpress.conf` — nginx site; copy to `/etc/nginx/sites-available/foodexpress`
- `env.server.example` — template for `backend/.env` on the server

## Prerequisites (do in the AWS console)
1. Launch **Ubuntu 24.04 LTS** t2.micro (24.04 ships Python 3.12, which Django 6 requires).
2. Download the `.pem` key pair.
3. Security group inbound: SSH 22 (My IP), HTTP 80, HTTPS 443 (Anywhere).
4. Note the public IPv4 address.

## 1. Connect
```bash
# Windows PowerShell: fix key perms first
icacls.exe foodexpress-key.pem /reset
icacls.exe foodexpress-key.pem /grant:r "$($env:USERNAME):(R)"
icacls.exe foodexpress-key.pem /inheritance:r

ssh -i foodexpress-key.pem ubuntu@<EC2_IP>
```

## 2. Install packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip python3-dev build-essential \
    libpq-dev nginx postgresql postgresql-contrib git
```

## 3. Clone + virtualenv
```bash
cd ~
git clone https://github.com/gaurmaitreyi-png/foodexpress.git
cd foodexpress/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python --version   # must be 3.12+
```

## 4. PostgreSQL
```bash
sudo -u postgres psql
```
```sql
CREATE DATABASE foodexpress;
CREATE USER foodexpress_user WITH PASSWORD 'CHANGE_ME';
ALTER ROLE foodexpress_user SET client_encoding TO 'utf8';
ALTER DATABASE foodexpress OWNER TO foodexpress_user;
GRANT ALL PRIVILEGES ON DATABASE foodexpress TO foodexpress_user;
\q
```

## 5. Environment + migrate
```bash
cp ~/foodexpress/deploy/env.server.example ~/foodexpress/backend/.env
python -c "import secrets; print(secrets.token_urlsafe(50))"   # paste into .env
nano ~/foodexpress/backend/.env                                # fill in values
python manage.py migrate
python manage.py collectstatic --no-input
python seed.py
```

## 6. Gunicorn (systemd)
```bash
sudo cp ~/foodexpress/deploy/gunicorn.service /etc/systemd/system/gunicorn.service
sudo systemctl daemon-reload
sudo systemctl start gunicorn
sudo systemctl enable gunicorn
sudo systemctl status gunicorn
```

## 7. Nginx
```bash
sudo cp ~/foodexpress/deploy/nginx-foodexpress.conf /etc/nginx/sites-available/foodexpress
sudo sed -i 's/SERVER_NAME_HERE/<EC2_IP>/' /etc/nginx/sites-available/foodexpress
sudo ln -s /etc/nginx/sites-available/foodexpress /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

## 8. Verify
- Visit `http://<EC2_IP>/api/restaurants/` → JSON list.
- Visit `http://<EC2_IP>/admin/` → styled login page (proves static works).

## Logs
```bash
sudo journalctl -u gunicorn -f          # app errors (live)
sudo tail -n 50 /var/log/nginx/error.log
sudo systemctl restart gunicorn         # after code/.env change
sudo nginx -t && sudo systemctl restart nginx   # after nginx change
```

## After editing code on the server
```bash
cd ~/foodexpress && git pull
cd backend && source venv/bin/activate
pip install -r requirements.txt          # if deps changed
python manage.py migrate                 # if models changed
python manage.py collectstatic --no-input
sudo systemctl restart gunicorn
```

## Notes
- HTTPS: browsers block https->http API calls, so a `https` frontend needs this
  server on HTTPS too. That requires a **domain name** + certbot (Let's Encrypt
  cannot issue certs for a bare IP). For IP-only testing, use an http frontend.
- The public IP changes on stop/start unless you attach an Elastic IP.
- `seed.py` deletes all restaurants before reseeding — don't re-run it once you
  have real data.
