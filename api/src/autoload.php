<?php
declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    if (str_starts_with($class, 'CalendApp\\')) {
        $file = __DIR__ . '/' . substr($class, 10) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});
