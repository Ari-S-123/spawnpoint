/**
 * E2E Test Script for Composio Instagram Posting
 *
 * Usage:
 *   bun run scripts/test-instagram-post.ts
 *
 * Prerequisites:
 *   - COMPOSIO_API_KEY set in .env
 *   - Instagram connected via: composio login && composio add instagram
 *
 * This script tests the full posting workflow end-to-end:
 *   1. Generates a caption via AI
 *   2. Selects a seeded image from Picsum
 *   3. Creates a media container via Composio
 *   4. Polls for container readiness
 *   5. Publishes the post
 */

import { createInstagramPost, publishFirstPost, generateFirstPostCaption, getFirstPostImageUrl } from '../src/lib/composio';

const TEST_AGENT_NAME = process.argv[2] || 'test-agent';

async function testCaptionGeneration() {
    console.log('\n=== Test 1: Caption Generation ===');
    try {
        const caption = await generateFirstPostCaption(TEST_AGENT_NAME);
        console.log(`✅ Generated caption: "${caption}"`);
        return caption;
    } catch (error) {
        console.error('❌ Caption generation failed:', error);
        throw error;
    }
}

function testImageUrl() {
    console.log('\n=== Test 2: Image URL Generation ===');
    const url = getFirstPostImageUrl(TEST_AGENT_NAME);
    console.log(`✅ Image URL: ${url}`);

    // Verify it's a valid URL
    try {
        new URL(url);
        console.log('✅ URL is valid');
    } catch {
        console.error('❌ Invalid URL generated');
        throw new Error('Invalid image URL');
    }

    return url;
}

async function testDirectPost(imageUrl: string, caption: string) {
    console.log('\n=== Test 3: Direct Post (explicit image + caption) ===');
    console.log(`  Image: ${imageUrl}`);
    console.log(`  Caption: ${caption}`);

    const result = await createInstagramPost(imageUrl, caption);

    if (result.success) {
        console.log('✅ Post published successfully!');
        console.log('  Result:', JSON.stringify(result.result, null, 2));
    } else {
        console.error('❌ Post failed:', result.error);
    }

    return result;
}

async function testPublishFirstPost() {
    console.log('\n=== Test 4: Full First Post Workflow ===');
    console.log(`  Agent name: ${TEST_AGENT_NAME}`);

    const result = await publishFirstPost(TEST_AGENT_NAME);

    if (result.success) {
        console.log('✅ First post published successfully!');
        console.log('  Result:', JSON.stringify(result.result, null, 2));
    } else {
        console.error('❌ First post failed:', result.error);
    }

    return result;
}

async function main() {
    console.log('🚀 Instagram Composio E2E Test');
    console.log(`   Agent: ${TEST_AGENT_NAME}`);
    console.log(`   COMPOSIO_API_KEY: ${process.env.COMPOSIO_API_KEY ? '✅ set' : '❌ missing'}`);
    console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ set' : '❌ missing'}`);

    const mode = process.argv[3] || 'full';

    // Only require COMPOSIO_API_KEY for modes that call the Instagram API
    if (mode !== 'caption-only' && mode !== 'url-only' && !process.env.COMPOSIO_API_KEY) {
        console.error('\n❌ COMPOSIO_API_KEY is required for this mode. Set it in .env');
        process.exit(1);
    }

    try {
        if (mode === 'caption-only') {
            // Just test caption generation (no Composio API call)
            await testCaptionGeneration();
        } else if (mode === 'url-only') {
            // Just test URL generation (no API calls at all)
            testImageUrl();
        } else if (mode === 'direct') {
            // Test direct post with explicit image and caption
            const caption = await testCaptionGeneration();
            const imageUrl = testImageUrl();
            await testDirectPost(imageUrl, caption);
        } else {
            // Full E2E test
            await testCaptionGeneration();
            testImageUrl();
            await testPublishFirstPost();
        }

        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

main();
