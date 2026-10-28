import { z } from 'zod';

// O zod testa `new Function` ao criar os esquemas, para acelerar a validação. A CSP (sem 'unsafe-eval', com Trusted
// Types) recusa e cada página registraria uma violação. Por isso este módulo é o primeiro import de cada main-*.ts:
// precisa rodar antes de qualquer esquema ser criado.
z.config({ jitless: true });
