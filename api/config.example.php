<?php
// Copia este archivo como config.local.php (fuera de git) o define las mismas claves como variables de entorno.
// Los valores de entorno tienen prioridad.
return [
    // Aplicación de Meta con el producto "Instagram" → "API con inicio de sesión de Instagram".
    'META_APP_ID'        => '',   // ID de la app de Instagram (Configuración de inicio de sesión empresarial)
    'META_APP_SECRET'    => '',   // Secreto de la app de Instagram
    // Debe coincidir EXACTAMENTE con una "URI de redireccionamiento OAuth" registrada en la app de Meta.
    'META_REDIRECT_URI'  => 'https://elchandriogroup.com/calendapp/api/instagram-callback.php',
    'META_GRAPH_VERSION' => 'v25.0',

    // Clave de 32 bytes en base64 para cifrar los tokens en reposo: php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
    'APP_KEY'            => '',
    // Contraseña de administración del servidor (o su hash de password_hash()).
    'ADMIN_PASSWORD'      => '',
    'ADMIN_PASSWORD_HASH' => '',

    // Dirección pública de la aplicación (para redirigir tras el OAuth y firmar URLs de medios).
    'APP_URL'            => 'https://elchandriogroup.com/calendapp/',
    // Ruta de la base de datos SQLite (por defecto api/data/calendapp.sqlite).
    'DB_PATH'            => '',
];
