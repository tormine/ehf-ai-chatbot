import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import type { Document } from 'langchain/document';

interface RagRequest {
  query: string;
}

interface RagResponse {
  results: Document[];
  message?: string;
}

// Environment variables with validation
if (!process.env.PINECONE_API_KEY) throw new Error('Missing PINECONE_API_KEY');
if (!process.env.PINECONE_INDEX_NAME) throw new Error('Missing PINECONE_INDEX_NAME');
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

export async function POST(
  request: Request
): Promise<NextResponse<RagResponse>> {
  try {
    const body = await request.json() as RagRequest;
    const { query } = body;

    if (!query) {
      throw new Error('Please include a "query" field in your JSON body.');
    }

    // Get Pinecone index
    const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

    // Setup embeddings
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
      dimensions: 1536,
    });

    // Setup the vector store
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
    });

    // Enhance query for better context matching
    const enhancedQuery = `EHF RINCK Convention: ${query}`;
    
    // Perform similarity search
    const results = await vectorStore.similaritySearch(enhancedQuery, 5);

    return NextResponse.json({ results });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
    console.error('[RAG Route Error]', error);
    return NextResponse.json({ results: [], message: errorMessage }, { status: 500 });
  }
} 