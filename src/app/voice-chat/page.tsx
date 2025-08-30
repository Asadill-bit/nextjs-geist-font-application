'use client';

import React from 'react';
import VoiceChat from '@/components/VoiceChat';

const VoiceChatPage: React.FC = () => {
  return (
    <main className="min-h-screen bg-white dark:bg-black p-6">
      <VoiceChat />
    </main>
  );
};

export default VoiceChatPage;
