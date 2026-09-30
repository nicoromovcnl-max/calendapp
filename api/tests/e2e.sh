#!/usr/bin/env bash
# Prueba de integración del backend contra un Meta simulado. Uso: bash api/tests/e2e.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP=http://127.0.0.1:8900; MOCK=http://127.0.0.1:8901
TMP="$(mktemp -d)"; JAR="$TMP/jar"; DB="$TMP/test.sqlite"
rm -f /tmp/calendapp_mock_state.json /tmp/calendapp_mock_fail_auth
export APP_KEY="$(php -r 'echo base64_encode(random_bytes(32));')" ADMIN_PASSWORD='pw-test' META_APP_ID=123 META_APP_SECRET=test-secret
export META_REDIRECT_URI="$APP/api/instagram-callback.php" APP_URL="$APP/" DB_PATH="$DB"
export META_GRAPH_BASE="$MOCK" META_OAUTH_TOKEN="$MOCK/oauth/access_token" MEDIA_ALLOW_PRIVATE=1
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8901 "$ROOT/api/tests/mock_meta.php" >/dev/null 2>&1 & M=$!
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8900 -t "$ROOT" >/dev/null 2>&1 & S=$!
trap 'kill $M $S 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
pass=0; fail=0
ok() { if [ "$2" = "1" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
H=(-H 'Content-Type: application/json' -H 'X-CalendApp: 1')
post() { curl -s -b "$JAR" -c "$JAR" "${H[@]}" -X POST "$APP/api/index.php?r=$1" -d "$2"; }
get() { curl -s -b "$JAR" -c "$JAR" "$APP/api/index.php?r=$1"; }
j() { php -r '$d=json_decode(stream_get_contents(STDIN),true); $p=explode(".",$argv[1]); foreach($p as $k){ if(!is_array($d)||!array_key_exists($k,$d)){echo "";exit;} $d=$d[$k]; } echo is_bool($d)?($d?"true":"false"):(is_array($d)?json_encode($d):$d);' "$1"; }

R=$(get status); ok "status disponible y configurado" "$([ "$(echo "$R" | j configured.meta_app)" = true ] && [ "$(echo "$R" | j configured.crypto)" = true ] && echo 1 || echo 0)"
R=$(get bootstrap); ok "5 cuentas iniciales sin conectar" "$([ "$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo count($d["accounts"]).":".count(array_filter($d["accounts"],fn($a)=>$a["status"]==="pending"));')" = "5:5" ] && echo 1 || echo 0)"
ok "5 proyectos actuales" "$([ "$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo count($d["projects"]);')" = 5 ] && echo 1 || echo 0)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP/api/index.php?r=accounts/add" -d '{}'); ok "POST sin cabecera CSRF rechazado" "$([ "$CODE" = 403 ] && echo 1 || echo 0)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X POST "$APP/api/index.php?r=accounts/add" -d '{"username":"x"}'); ok "acción sin sesión → 401" "$([ "$CODE" = 401 ] && echo 1 || echo 0)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X POST "$APP/api/index.php?r=auth/login" -d '{"password":"mala"}'); ok "contraseña incorrecta → 401" "$([ "$CODE" = 401 ] && echo 1 || echo 0)"
R=$(post auth/login '{"password":"pw-test"}'); ok "login correcto" "$([ "$(echo "$R" | j ok)" = true ] && echo 1 || echo 0)"

R=$(post instagram/connect '{"project_id":"corfu"}'); URL=$(echo "$R" | j url); STATE=$(echo "$URL" | sed -n 's/.*state=\([0-9a-f]*\).*/\1/p')
ok "URL de autorización oficial con scopes y state" "$(echo "$URL" | grep -q 'instagram.com/oauth/authorize' && echo "$URL" | grep -q 'instagram_business_content_publish' && [ -n "$STATE" ] && echo 1 || echo 0)"
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR" -c "$JAR" "$APP/api/instagram-callback.php?code=corfu&state=badstate")
ok "state inválido rechazado" "$(echo "$LOC" | grep -q 'ig=error' && echo 1 || echo 0)"
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR" -c "$JAR" "$APP/api/instagram-callback.php?code=corfu&state=$STATE")
ok "callback conecta la cuenta" "$(echo "$LOC" | grep -q 'ig=connected' && echo 1 || echo 0)"
R=$(get bootstrap)
ok "teatrocorfu7 conectada con proyecto corfu" "$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach($d["accounts"] as $a){ if($a["username"]==="teatrocorfu7"){ echo ($a["status"]==="connected" && $a["project_id"]==="corfu" && !empty($a["token_expires_at"]))?1:0; } }')"
ok "las demás siguen sin conectar" "$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo count(array_filter($d["accounts"],fn($a)=>$a["status"]==="connected"))===1?1:0;')"
ok "el token no viaja al cliente" "$(echo "$R" | grep -qE 'LONG_|SHORT_|access_token' && echo 0 || echo 1)"
ok "el token está cifrado en la base de datos" "$(php -r '$p=new PDO("sqlite:".$argv[1]); $t=$p->query("SELECT access_token_enc FROM social_accounts WHERE username=\"teatrocorfu7\"")->fetchColumn(); echo ($t && strpos($t,"LONG_")===false)?1:0;' "$DB")"

# cuenta personal → rechazada
S2=$(post instagram/connect '{}' | j url | sed -n 's/.*state=\([0-9a-f]*\).*/\1/p')
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -b "$JAR" -c "$JAR" "$APP/api/instagram-callback.php?code=personal&state=$S2")
ok "cuenta personal rechazada" "$(echo "$LOC" | grep -q 'ig=error' && echo 1 || echo 0)"

ACC=$(get bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach($d["accounts"] as $a){ if($a["username"]==="teatrocorfu7") echo $a["id"]; }')
ACC2=$(get bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach($d["accounts"] as $a){ if($a["username"]==="clubtemeraria") echo $a["id"]; }')
FUT=$(php -r 'echo gmdate("c", time()+3600);'); PAST=$(php -r 'echo gmdate("c", time()-3600);')
IMG="$MOCK/files/foto.jpg"
R=$(post publications/save "{\"ref\":\"corfu|2026-09-30|cerramos\",\"project_id\":\"corfu\",\"title\":\"Cerramos\",\"caption\":\"Texto #hola\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"scheduled\",\"scheduled_at\":\"$FUT\"}]}")
ok "programar destino futuro" "$([ "$(echo "$R" | j destinations.0.status)" = scheduled ] && echo 1 || echo 0)"
R=$(post publications/save "{\"ref\":\"x|1\",\"project_id\":\"corfu\",\"title\":\"x\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"scheduled\",\"scheduled_at\":\"$PAST\"}]}")
ok "programar en el pasado rechazado" "$([ "$(echo "$R" | j ok)" = false ] && echo 1 || echo 0)"
R=$(post publications/save "{\"ref\":\"x|2\",\"project_id\":\"temeraria\",\"title\":\"x\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC2,\"status\":\"scheduled\",\"scheduled_at\":\"$FUT\"}]}")
ok "programar en cuenta sin conectar rechazado" "$([ "$(echo "$R" | j ok)" = false ] && echo 1 || echo 0)"

# publicar ahora: imagen
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|img\",\"project_id\":\"corfu\",\"title\":\"Img\",\"caption\":\"Hola\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D1=$(echo "$R" | j destinations.0.id)
R=$(post destinations/publish "{\"id\":$D1}")
ok "publicar imagen ahora" "$([ "$(echo "$R" | j destination.status)" = published ] && [ -n "$(echo "$R" | j destination.external_post_id)" ] && echo 1 || echo 0)"
ok "permalink guardado" "$(echo "$R" | j destination.external_url | grep -q 'instagram.com/p/' && echo 1 || echo 0)"
ok "Meta recibió image_url firmada del relé" "$(php -r '$s=json_decode(file_get_contents("/tmp/calendapp_mock_state.json"),true); $c=end($s["containers"]); echo (strpos($c["image_url"],"/api/media.php?u=")!==false && ($c["caption"]??"")==="Hola")?1:0;')"
# reel (espera IN_PROGRESS → FINISHED)
VID="$MOCK/files/clip.mp4"
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|reel\",\"project_id\":\"corfu\",\"title\":\"Reel\",\"caption\":\"Reel\",\"tipo\":\"reel\",\"media\":[\"$VID\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D2=$(echo "$R" | j destinations.0.id); R=$(post destinations/publish "{\"id\":$D2}")
ok "publicar reel (espera al contenedor)" "$([ "$(echo "$R" | j destination.status)" = published ] && echo 1 || echo 0)"
ok "reel usa media_type REELS y video_url" "$(php -r '$s=json_decode(file_get_contents("/tmp/calendapp_mock_state.json"),true); $c=end($s["containers"]); echo ($c["media_type"]==="REELS" && isset($c["video_url"]))?1:0;')"
# carrusel
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|car\",\"project_id\":\"corfu\",\"title\":\"Car\",\"caption\":\"Car\",\"tipo\":\"carrusel\",\"media\":[\"$IMG\",\"$MOCK/files/otra.jpg\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D3=$(echo "$R" | j destinations.0.id); R=$(post destinations/publish "{\"id\":$D3}")
ok "publicar carrusel" "$([ "$(echo "$R" | j destination.status)" = published ] && echo 1 || echo 0)"
ok "carrusel: hijos con is_carousel_item y padre CAROUSEL" "$(php -r '$s=json_decode(file_get_contents("/tmp/calendapp_mock_state.json"),true); $c=end($s["containers"]); $k=array_values($s["containers"]); echo ($c["media_type"]==="CAROUSEL" && count(explode(",",$c["children"]))===2 && ($k[count($k)-2]["is_carousel_item"]??"")==="true")?1:0;')"
# PNG → convertido si hay GD; si no, rechazado por el propio Meta simulado
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|html\",\"project_id\":\"corfu\",\"title\":\"H\",\"tipo\":\"imagen\",\"media\":[\"$MOCK/files/pagina.html\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D4=$(echo "$R" | j destinations.0.id); R=$(post destinations/publish "{\"id\":$D4}")
ok "archivo no público → error legible" "$([ "$(echo "$R" | j destination.status)" = failed ] && echo "$R" | j destination.error_message | grep -qi 'archivo' && echo 1 || echo 0)"
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|yt\",\"project_id\":\"corfu\",\"title\":\"Y\",\"tipo\":\"reel\",\"media\":[\"https://www.youtube.com/watch?v=abc\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D5=$(echo "$R" | j destinations.0.id); R=$(post destinations/publish "{\"id\":$D5}")
ok "YouTube no se publica en Instagram" "$([ "$(echo "$R" | j destination.status)" = failed ] && echo "$R" | j destination.error_message | grep -q 'YouTube' && echo 1 || echo 0)"
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|txt\",\"project_id\":\"corfu\",\"title\":\"T\",\"tipo\":\"texto\",\"media\":[],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D6=$(echo "$R" | j destinations.0.id); R=$(post destinations/publish "{\"id\":$D6}")
ok "solo texto no se publica" "$([ "$(echo "$R" | j destination.status)" = failed ] && echo 1 || echo 0)"

# scheduler real por CLI
SOON=$(php -r 'echo gmdate("c", time()+2);')
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|cron\",\"project_id\":\"corfu\",\"title\":\"Cron\",\"caption\":\"Auto\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"scheduled\",\"scheduled_at\":\"$SOON\"}]}")
DC=$(echo "$R" | j destinations.0.id)
OUT=$(php "$ROOT/api/cron/publish_due.php"); ok "cron no publica antes de hora" "$([ -z "$OUT" ] && echo 1 || echo 0)"
sleep 3; OUT=$(php "$ROOT/api/cron/publish_due.php"); echo "  cron: $OUT"
ST=$(get bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach($d["destinations"] as $x){ if($x["id"]==(int)$argv[1]) echo $x["status"]; }' "$DC")
ok "cron publica el destino programado sin navegador" "$([ "$ST" = published ] && echo 1 || echo 0)"
OUT=$(php "$ROOT/api/cron/publish_due.php"); ok "cron no republica" "$([ -z "$OUT" ] && echo 1 || echo 0)"

# cancelar, renovar, comprobar, desconectar
R=$(post publications/save "{\"ref\":\"corfu|2026-10-01|c\",\"project_id\":\"corfu\",\"title\":\"C\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"scheduled\",\"scheduled_at\":\"$FUT\"}]}")
DX=$(echo "$R" | j destinations.0.id); R=$(post destinations/cancel "{\"id\":$DX}"); ok "cancelar destino programado" "$([ "$(echo "$R" | j ok)" = true ] && echo 1 || echo 0)"
R=$(post accounts/check "{\"id\":$ACC}"); ok "comprobar cuenta devuelve cuota real de Meta" "$([ "$(echo "$R" | j quota.total)" = 50 ] && echo 1 || echo 0)"
R=$(post accounts/refresh "{\"id\":$ACC}"); ok "renovar token" "$([ "$(echo "$R" | j ok)" = true ] && echo 1 || echo 0)"
# token inválido → destino falla y la cuenta pasa a caducada
touch /tmp/calendapp_mock_fail_auth
R=$(post publications/save "{\"ref\":\"corfu|2026-09-29|tok\",\"project_id\":\"corfu\",\"title\":\"Tok\",\"caption\":\"x\",\"tipo\":\"imagen\",\"media\":[\"$IMG\"],\"destinations\":[{\"social_account_id\":$ACC,\"status\":\"draft\"}]}")
D7=$(echo "$R" | j destinations.0.id); R=$(post destinations/publish "{\"id\":$D7}")
ok "token rechazado → destino en error" "$([ "$(echo "$R" | j destination.status)" = failed ] && echo 1 || echo 0)"
ok "…y la cuenta queda marcada como caducada" "$(get bootstrap | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach($d["accounts"] as $a){ if($a["username"]==="teatrocorfu7") echo $a["status"]==="expired"?1:0; }')"
rm -f /tmp/calendapp_mock_fail_auth
R=$(post accounts/disconnect "{\"id\":$ACC}"); ok "desconectar cuenta" "$([ "$(echo "$R" | j ok)" = true ] && echo 1 || echo 0)"
ok "tras desconectar no queda token" "$(php -r '$p=new PDO("sqlite:".$argv[1]); echo $p->query("SELECT access_token_enc FROM social_accounts WHERE username=\"teatrocorfu7\"")->fetchColumn()===null?1:0;' "$DB")"
R=$(post accounts/add '{"username":"@nuevacuenta","project_id":"chandrio"}'); ok "añadir cuenta nueva sin tocar código" "$([ "$(echo "$R" | j ok)" = true ] && echo 1 || echo 0)"
R=$(post accounts/update "{\"id\":$ACC2,\"project_id\":\"ticketea\"}"); ok "relación proyecto↔cuenta editable" "$([ "$(echo "$R" | j ok)" = true ] && echo 1 || echo 0)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$APP/api/media.php?u=aaa&e=1&s=bbb"); ok "relé de medios rechaza firma inválida" "$([ "$CODE" = 403 ] && echo 1 || echo 0)"
post auth/logout '{}' >/dev/null; CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "${H[@]}" -X POST "$APP/api/index.php?r=accounts/add" -d '{"username":"zzz"}'); ok "tras cerrar sesión, acciones bloqueadas" "$([ "$CODE" = 401 ] && echo 1 || echo 0)"
echo "---- $pass OK, $fail fallos"
[ "$fail" = 0 ]
