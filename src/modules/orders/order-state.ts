import { ConflictException } from '@nestjs/common';
import { OrderState } from '@prisma/client';

// Tabla canonica de transiciones permitidas. Toda transicion no listada aqui
// produce 409 Conflict. La razon de tener esto centralizado es evitar que
// distintos endpoints reimplementen la regla y diverjan.
const ALLOWED: Record<OrderState, ReadonlyArray<OrderState>> = {
  draft: ['in_progress', 'cancelled'],
  in_progress: ['validated', 'draft', 'cancelled'],
  validated: ['delivered', 'cancelled'],
  delivered: ['amended'],
  amended: [],
  cancelled: [],
};

export function assertTransition(from: OrderState, to: OrderState): void {
  if (from === to) {
    throw new ConflictException(`La orden ya esta en estado ${from}`);
  }
  if (!ALLOWED[from].includes(to)) {
    throw new ConflictException(`Transicion no permitida: ${from} -> ${to}`);
  }
}

export function canEditMetadata(state: OrderState): boolean {
  return state === OrderState.draft || state === OrderState.in_progress;
}

export function canEditItems(state: OrderState): boolean {
  return state === OrderState.draft || state === OrderState.in_progress;
}

export function canEditResults(state: OrderState): boolean {
  return state === OrderState.draft || state === OrderState.in_progress;
}

export function isFinalState(state: OrderState): boolean {
  return state === OrderState.amended || state === OrderState.cancelled;
}
