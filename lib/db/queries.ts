import 'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { and, asc, desc, eq, gt, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  type Message,
  message,
  vote,
  type InsertUser,
  type InsertChat,
  type InsertDocument,
} from './schema';
import { BlockKind } from '@/components/block';

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export type UpdateChat = Partial<{
  title: string;
  userId: string;
  visibility: 'public' | 'private';
}>;

export async function getOrCreateDefaultUser() {
  try {
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.id, DEFAULT_USER_ID))
      .limit(1);

    if (!existingUser.length) {
      const defaultUser: InsertUser = {
        id: DEFAULT_USER_ID,
        email: 'default@example.com',
        password: 'not-used',
      };
      await db.insert(user).values(defaultUser);
    }
    return DEFAULT_USER_ID;
  } catch (error) {
    console.error('Failed to get or create default user:', error);
    return DEFAULT_USER_ID;
  }
}

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is not defined');
}

// Configure postgres client with SSL
const client = postgres(process.env.POSTGRES_URL, {
  ssl: {
    rejectUnauthorized: false
  }
});

const db = drizzle(client);

// Ensure default user exists when module loads
getOrCreateDefaultUser().catch(console.error);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database');
    throw error;
  }
}

export async function createUser(email: string, password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  const newUser: InsertUser = {
    email,
    password: hash,
  };

  try {
    return await db.insert(user).values(newUser);
  } catch (error) {
    console.error('Failed to create user in database');
    throw error;
  }
}

export async function saveChat({ id, userId, title }: { 
  id: string;
  userId: string;
  title: string;
}) {
  try {
    const newChat: InsertChat = {
      id,
      userId,
      title,
    };
    await db.insert(chat).values(newChat);
    return await getChatById({ id });
  } catch (error) {
    console.error('Failed to save chat');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(chat)
      .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    // Verify chat exists first
    const chatId = messages[0]?.chatId;
    if (chatId) {
      const existingChat = await getChatById({ id: chatId });
      if (!existingChat) {
        throw new Error(`Chat ${chatId} does not exist`);
      }
    }
    
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({ title, kind, content = '', userId }: {
  id: string;
  title: string;
  kind: BlockKind;
  content?: string;
  userId: string;
}) {
  try {
    return await db.insert(document).values({
      title,
      kind,
      content,
      userId,
    });
  } catch (error) {
    console.error('Failed to save document');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    return await db
      .delete(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisibility({ chatId, visibility }: { 
  chatId: string;
  visibility: 'public' | 'private';
}) {
  try {
    const updateData: UpdateChat = { visibility };
    return await db.update(chat).set(updateData).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility');
    throw error;
  }
}
