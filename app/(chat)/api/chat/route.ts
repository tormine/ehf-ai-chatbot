import {
  type Message,
  type TextPart,
  type ImagePart,
  type FilePart,
  convertToCoreMessages,
  createDataStreamResponse,
  experimental_generateImage,
  streamObject,
  streamText,
} from 'ai';
import { z } from 'zod';
import { type Document } from 'langchain/document';
import { NextResponse } from 'next/server';

import { auth } from '@/app/(auth)/auth';
import { customModel, imageGenerationModel } from '@/lib/ai';
import { models } from '@/lib/ai/models';
import {
  SYSTEM_PROMPT,
  CODE_PROMPT as codePrompt,
  UPDATE_DOCUMENT_PROMPT as updateDocumentPrompt,
  buildSystemPrompt,
} from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getDocumentById,
  saveChat,
  saveDocument,
  saveMessages,
  saveSuggestions,
} from '@/lib/db/queries';
import type { Suggestion } from '@/lib/db/schema';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';

export const maxDuration = 60;

type AllowedTools =
  | 'createDocument'
  | 'updateDocument'
  | 'requestSuggestions'
  | 'getWeather'
  | 'fetchContext';

const blocksTools: AllowedTools[] = [
  'createDocument',
  'updateDocument',
  'requestSuggestions',
];

const weatherTools: AllowedTools[] = ['getWeather'];

const allTools: AllowedTools[] = [...blocksTools, ...weatherTools, 'fetchContext'];

// Remove auth checks and use a default user ID
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

interface RagToolResponse {
  results: any[];
  message?: string;
}

type MessagePart = TextPart | ImagePart | FilePart;

function getPartContent(part: MessagePart | string): string {
  if (typeof part === 'string') return part;
  
  // For text content
  if ('text' in part && typeof part.text === 'string') {
    return part.text;
  }
  
  // For any URL-based content (images, files, etc.)
  if ('url' in part && typeof part.url === 'string') {
    return part.url;
  }
  
  return '';
}

function convertMessageContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(getPartContent).join(' ');
  if (content && typeof content === 'object') {
    // Handle tool call results or other structured content
    return JSON.stringify(content);
  }
  return '';
}

export async function POST(request: Request) {
  const {
    id,
    messages,
    modelId,
  }: { id: string; messages: Array<Message>; modelId: string } =
    await request.json();

  // Remove auth check and use default user
  const userId = DEFAULT_USER_ID;

  const model = models.find((model) => model.id === modelId);

  if (!model) {
    return new Response('Model not found', { status: 404 });
  }

  const coreMessages = convertToCoreMessages(messages);
  const userMessage = getMostRecentUserMessage(coreMessages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: userId, title });
  }

  const userMessageId = generateUUID();

  await saveMessages({
    messages: [
      {
        id: userMessageId,
        createdAt: new Date(),
        chatId: id,
        role: userMessage.role,
        content: typeof userMessage.content === 'string'
          ? userMessage.content
          : Array.isArray(userMessage.content)
            ? userMessage.content.map(getPartContent).join(' ')
            : '',
      },
    ],
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      // Fetch relevant context first
      let contextDocs: any[] = [];
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/rag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query: typeof userMessage.content === 'string' 
              ? userMessage.content 
              : Array.isArray(userMessage.content)
                ? userMessage.content.map(getPartContent).join(' ')
                : ''
          }),
        });

        if (!response.ok) {
          console.error('RAG response not ok:', await response.text());
          contextDocs = [];
        } else {
          const data = await response.json();
          contextDocs = data.results;
          console.log('Retrieved context:', contextDocs);
        }
      } catch (error) {
        console.error('Failed to fetch context:', error);
        contextDocs = [];
      }

      const result = streamText({
        model: customModel(model.apiIdentifier),
        system: buildSystemPrompt(contextDocs),
        messages: coreMessages,
        maxSteps: 5,
        temperature: 0.7,
        experimental_activeTools: allTools,
        tools: {
          getWeather: {
            description: 'Get the current weather at a location',
            parameters: z.object({
              latitude: z.number(),
              longitude: z.number(),
            }),
            execute: async ({ latitude, longitude }) => {
              const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
              );

              const weatherData = await response.json();
              return weatherData;
            },
          },
          createDocument: {
            description:
              'Create a document for a writing or content creation activities like image generation. This tool will call other functions that will generate the contents of the document based on the title and kind.',
            parameters: z.object({
              title: z.string(),
              kind: z.enum(['text', 'code', 'image']),
            }),
            execute: async ({ title, kind }) => {
              const id = generateUUID();
              let draftText = '';

              dataStream.writeData({
                type: 'id',
                content: id,
              });

              dataStream.writeData({
                type: 'title',
                content: title,
              });

              dataStream.writeData({
                type: 'kind',
                content: kind,
              });

              dataStream.writeData({
                type: 'clear',
                content: '',
              });

              if (kind === 'text') {
                const { fullStream } = streamText({
                  model: customModel(model.apiIdentifier),
                  system:
                    'Write about the given topic. Markdown is supported. Use headings wherever appropriate.',
                  prompt: title,
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'text-delta') {
                    const { textDelta } = delta;

                    draftText += textDelta;
                    dataStream.writeData({
                      type: 'text-delta',
                      content: textDelta,
                    });
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              } else if (kind === 'code') {
                const { fullStream } = streamObject({
                  model: customModel(model.apiIdentifier),
                  system: codePrompt,
                  prompt: title,
                  schema: z.object({
                    code: z.string(),
                  }),
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'object') {
                    const { object } = delta;
                    const { code } = object;

                    if (code) {
                      dataStream.writeData({
                        type: 'code-delta',
                        content: code ?? '',
                      });

                      draftText = code;
                    }
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              } else if (kind === 'image') {
                const { image } = await experimental_generateImage({
                  model: imageGenerationModel,
                  prompt: title,
                  n: 1,
                });

                draftText = image.base64;

                dataStream.writeData({
                  type: 'image-delta',
                  content: image.base64,
                });

                dataStream.writeData({ type: 'finish', content: '' });
              }

              if (userId) {
                await saveDocument({
                  id,
                  title,
                  kind,
                  content: draftText,
                  userId: userId,
                });
              }

              return {
                id,
                title,
                kind,
                content:
                  'A document was created and is now visible to the user.',
              };
            },
          },
          updateDocument: {
            description: 'Update a document with the given description.',
            parameters: z.object({
              id: z.string().describe('The ID of the document to update'),
              description: z
                .string()
                .describe('The description of changes that need to be made'),
            }),
            execute: async ({ id, description }) => {
              const document = await getDocumentById({ id });

              if (!document) {
                return {
                  error: 'Document not found',
                };
              }

              const { content: currentContent } = document;
              let draftText = '';

              dataStream.writeData({
                type: 'clear',
                content: document.title,
              });

              if (document.kind === 'text') {
                const { fullStream } = streamText({
                  model: customModel(model.apiIdentifier),
                  system: updateDocumentPrompt(currentContent, 'text'),
                  prompt: description,
                  experimental_providerMetadata: {
                    openai: {
                      prediction: {
                        type: 'content',
                        content: currentContent,
                      },
                    },
                  },
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'text-delta') {
                    const { textDelta } = delta;

                    draftText += textDelta;
                    dataStream.writeData({
                      type: 'text-delta',
                      content: textDelta,
                    });
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              } else if (document.kind === 'code') {
                const { fullStream } = streamObject({
                  model: customModel(model.apiIdentifier),
                  system: updateDocumentPrompt(currentContent, 'code'),
                  prompt: description,
                  schema: z.object({
                    code: z.string(),
                  }),
                });

                for await (const delta of fullStream) {
                  const { type } = delta;

                  if (type === 'object') {
                    const { object } = delta;
                    const { code } = object;

                    if (code) {
                      dataStream.writeData({
                        type: 'code-delta',
                        content: code ?? '',
                      });

                      draftText = code;
                    }
                  }
                }

                dataStream.writeData({ type: 'finish', content: '' });
              } else if (document.kind === 'image') {
                const { image } = await experimental_generateImage({
                  model: imageGenerationModel,
                  prompt: description,
                  n: 1,
                });

                draftText = image.base64;

                dataStream.writeData({
                  type: 'image-delta',
                  content: image.base64,
                });

                dataStream.writeData({ type: 'finish', content: '' });
              }

              if (userId) {
                await saveDocument({
                  id,
                  title: document.title,
                  content: draftText,
                  kind: document.kind,
                  userId: userId,
                });
              }

              return {
                id,
                title: document.title,
                kind: document.kind,
                content: 'The document has been updated successfully.',
              };
            },
          },
          requestSuggestions: {
            description: 'Request suggestions for a document',
            parameters: z.object({
              documentId: z
                .string()
                .describe('The ID of the document to request edits'),
            }),
            execute: async ({ documentId }) => {
              const document = await getDocumentById({ id: documentId });

              if (!document || !document.content) {
                return {
                  error: 'Document not found',
                };
              }

              const suggestions: Array<
                Omit<Suggestion, 'userId' | 'createdAt' | 'documentCreatedAt'>
              > = [];

              const { elementStream } = streamObject({
                model: customModel(model.apiIdentifier),
                system:
                  'You are a help writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions.',
                prompt: document.content,
                output: 'array',
                schema: z.object({
                  originalSentence: z
                    .string()
                    .describe('The original sentence'),
                  suggestedSentence: z
                    .string()
                    .describe('The suggested sentence'),
                  description: z
                    .string()
                    .describe('The description of the suggestion'),
                }),
              });

              for await (const element of elementStream) {
                const suggestion = {
                  originalText: element.originalSentence,
                  suggestedText: element.suggestedSentence,
                  description: element.description,
                  id: generateUUID(),
                  documentId: documentId,
                  isResolved: false,
                };

                dataStream.writeData({
                  type: 'suggestion',
                  content: suggestion,
                });

                suggestions.push(suggestion);
              }

              if (userId) {
                await saveSuggestions({
                  suggestions: suggestions.map((suggestion) => ({
                    ...suggestion,
                    userId,
                    createdAt: new Date(),
                    documentCreatedAt: document.createdAt,
                  })),
                });
              }

              return {
                id: documentId,
                title: document.title,
                kind: document.kind,
                message: 'Suggestions have been added to the document',
              };
            },
          },
          fetchContext: {
            description: 'Fetch relevant context from our Pinecone-based RAG route',
            parameters: z.object({
              query: z.string().min(1, 'Query must not be empty'),
            }),
            execute: async ({ query }: { query: string }): Promise<Document[]> => {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
              
              try {
                const response = await fetch(`${baseUrl}/api/rag`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query }),
                });

                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({})) as { message?: string };
                  throw new Error(errorData.message || 'Failed to fetch context');
                }

                const data = await response.json() as RagToolResponse;
                return data.results;
              } catch (error) {
                console.error('Error fetching context:', error instanceof Error ? error.message : error);
                return [];
              }
            },
          },
        },
        onFinish: async ({ response }) => {
          if (userId) {
            try {
              const responseMessagesWithoutIncompleteToolCalls =
                sanitizeResponseMessages(response.messages);

              await saveMessages({
                messages: responseMessagesWithoutIncompleteToolCalls.map(
                  (message) => {
                    const messageId = generateUUID();

                    if (message.role === 'assistant') {
                      dataStream.writeMessageAnnotation({
                        messageIdFromServer: messageId,
                      });
                    }

                    return {
                      id: messageId,
                      chatId: id,
                      role: message.role,
                      content: convertMessageContent(message.content),
                      createdAt: new Date(),
                    };
                  },
                ),
              });
            } catch (error) {
              console.error('Failed to save chat');
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
