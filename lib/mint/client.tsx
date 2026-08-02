'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type {
  CardRenderInput,
  FrameVariant,
  Mintable,
  SetRecord,
  ShelfCard,
} from './contracts';

export interface ClaimMintArgs {
  userId: string;
  mintable: Mintable;
  frameVariant: FrameVariant;
  renderInput: CardRenderInput;
}

export interface MintClient {
  useShelf(userId: string): ShelfCard[] | undefined;
  useMintableNow(userId: string): Mintable[] | undefined;
  claim(args: ClaimMintArgs): Promise<ShelfCard>;
}

interface MintContextValue {
  userId: string;
  shelf: ShelfCard[] | undefined;
  mintableNow: Mintable[] | undefined;
  claim(args: Omit<ClaimMintArgs, 'userId'>): Promise<ShelfCard>;
}

const MintContext = createContext<MintContextValue | null>(null);

export function MintClientProvider({
  client,
  userId,
  children,
}: {
  client: MintClient;
  userId: string;
  children: ReactNode;
}) {
  const shelf = client.useShelf(userId);
  const mintableNow = client.useMintableNow(userId);
  const value = useMemo<MintContextValue>(
    () => ({
      userId,
      shelf,
      mintableNow,
      claim: (args) => client.claim({ ...args, userId }),
    }),
    [client, mintableNow, shelf, userId],
  );
  return <MintContext.Provider value={value}>{children}</MintContext.Provider>;
}

export function useMintClient(): MintContextValue {
  const value = useContext(MintContext);
  if (!value) throw new Error('useMintClient must be used inside MintClientProvider');
  return value;
}

export interface FixtureMintClientOptions {
  shelf?: ShelfCard[];
  mintableNow?: Mintable[];
  sets?: Record<string, SetRecord>;
  latencyMs?: number;
}

/**
 * A reactive, deduping fixture adapter for isolated development. Path 4 can
 * replace this object with one whose hooks call Convex useQuery/useMutation.
 */
export function createFixtureMintClient(options: FixtureMintClientOptions = {}): MintClient {
  let shelf = [...(options.shelf ?? [])];
  let mintableNow = [...(options.mintableNow ?? [])];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    useShelf() {
      return useSyncExternalStore(subscribe, () => shelf, () => shelf);
    },
    useMintableNow() {
      return useSyncExternalStore(subscribe, () => mintableNow, () => mintableNow);
    },
    async claim(args) {
      const existing = shelf.find((card) => card.setId === args.mintable.setId);
      if (existing) return existing;
      if (options.latencyMs) {
        await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
      }
      // Recheck after the await so two fast calls still reconcile to one card.
      const raced = shelf.find((card) => card.setId === args.mintable.setId);
      if (raced) return raced;
      const card: ShelfCard = {
        id: `fixture-${args.userId}-${args.mintable.setId}`,
        setId: args.mintable.setId,
        mintedAt: Date.now(),
        dwellSeconds: args.mintable.dwellSeconds,
        ...args.renderInput,
      };
      shelf = [card, ...shelf];
      mintableNow = mintableNow.filter((item) => item.setId !== card.setId);
      emit();
      return card;
    },
  };
}
