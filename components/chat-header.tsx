'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { memo } from 'react';
import { Message } from 'ai';
import type { VisibilityType } from './visibility-selector';

function PureChatHeader({
  chatId,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
  messages = [],
}: {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  messages?: Array<Message>;
}) {
  const router = useRouter();

  return (
    <>
      <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
        <Button
          variant="outline"
          className="order-1 md:px-2 px-2 md:h-fit"
          onClick={() => {
            router.push('/');
            router.refresh();
          }}
        >
          <PlusIcon />
          <span className="md:sr-only">New Chat</span>
        </Button>

        <div className="flex items-center gap-2 py-1.5 px-2 h-[34px] order-2 ml-auto">
          <Image src="/favicon.ico" alt="Charly" width={16} height={16} />
          <span className="font-semibold hidden md:inline">
            Charly, the Home of Handball AI
          </span>
        </div>
      </header>

      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-8">
          <div className="max-w-2xl text-center space-y-4">
            <h1 className="text-2xl font-bold">👋 Hi! I'm Charly</h1>
            <p className="text-muted-foreground">
              I can help you understand handball coaching education, especially the RINCK Convention and EHF guidelines. Feel free to ask me anything about handball coaching or browse the example questions below!
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId 
    && prevProps.messages?.length === nextProps.messages?.length;
});
