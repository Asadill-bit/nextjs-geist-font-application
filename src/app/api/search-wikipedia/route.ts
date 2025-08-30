import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: 'Query missing' }, { status: 400 });
    }

    // Search for Wikipedia pages
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.query?.search?.length) {
      return NextResponse.json({ results: [] });
    }

    // Get summary for the first result
    const firstResult = searchData.query.search[0];
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult.title)}`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();

    return NextResponse.json({
      results: [{
        title: summaryData.title,
        summary: summaryData.extract,
        url: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(firstResult.title)}`
      }]
    });
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return NextResponse.json({ error: 'Search error' }, { status: 500 });
  }
}
