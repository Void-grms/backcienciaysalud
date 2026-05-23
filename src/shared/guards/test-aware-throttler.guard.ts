import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Wrapper del ThrottlerGuard estandar que se desactiva cuando NODE_ENV=test.
// Razon: los specs e2e hacen multiples llamadas a /auth/login con el mismo
// IP de loopback y el limite agresivo (5/min) los hace fallar en cadena.
// En produccion y dev el throttle se mantiene activo.
@Injectable()
export class TestAwareThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    return super.canActivate(context);
  }
}
