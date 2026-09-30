<?php
echo "curl: " . (function_exists('curl_init') ? 'SÍ' : 'NO') . "\n";
echo "allow_url_fopen: " . (ini_get('allow_url_fopen') ? 'SÍ' : 'NO') . "\n";
$test = @file_get_contents('https://www.google.com');
echo "file_get_contents externo: " . ($test ? 'SÍ' : 'NO') . "\n";