
from app.news_intelligence import parse_rss


def test_parse_rss_extracts_crypto_assets_and_heuristic_impact():
    xml = """<?xml version='1.0'?>
    <rss version='2.0'><channel><item>
      <title>Bitcoin ETF approval draws institutional inflows</title>
      <link>https://example.com/bitcoin-etf</link>
      <description><![CDATA[<p>Bitcoin and BTC markets react to the SEC decision.</p>]]></description>
      <pubDate>Wed, 12 Nov 2026 08:00:00 GMT</pubDate>
    </item></channel></rss>"""
    items = parse_rss(xml, "Example")

    assert len(items) == 1
    assert items[0]["source"] == "Example"
    assert items[0]["assets"] == ["BTC"]
    assert items[0]["impact"] == "high"
    assert items[0]["category"] == "crypto"
    assert items[0]["summary"].startswith("Bitcoin and BTC")
    assert items[0]["image_url"] is None


def test_parse_atom_feed():
    xml = """<feed xmlns='http://www.w3.org/2005/Atom'><entry>
      <title>Federal Reserve keeps rates unchanged</title>
      <link href='https://example.com/fed' rel='alternate'/>
      <summary>Inflation and treasury yields remain in focus.</summary>
      <updated>2026-11-12T08:00:00Z</updated>
    </entry></feed>"""
    items = parse_rss(xml, "Example Atom")

    assert len(items) == 1
    assert items[0]["category"] == "economy"
    assert items[0]["url"] == "https://example.com/fed"
    assert items[0]["image_url"] is None


def test_parse_rss_extracts_media_thumbnail():
    xml = """<rss version='2.0'
      xmlns:media='http://search.yahoo.com/mrss/'>
      <channel><item>
        <title>Bitcoin market update</title>
        <link>https://example.com/bitcoin</link>
        <description>Bitcoin market update.</description>
        <media:thumbnail
          url='https://example.com/images/bitcoin.jpg'/>
      </item></channel></rss>"""

    items = parse_rss(xml, "Example")

    assert len(items) == 1
    assert items[0]["image_url"] == "https://example.com/images/bitcoin.jpg"


def test_parse_rss_extracts_media_content_image():
    xml = """<rss version='2.0'
      xmlns:media='http://search.yahoo.com/mrss/'>
      <channel><item>
        <title>Ethereum market update</title>
        <link>https://example.com/ethereum</link>
        <description>Ethereum market update.</description>
        <media:content
          url='https://example.com/images/ethereum.webp'
          type='image/webp'/>
      </item></channel></rss>"""

    items = parse_rss(xml, "Example")

    assert len(items) == 1
    assert items[0]["image_url"] == "https://example.com/images/ethereum.webp"


def test_parse_rss_extracts_image_from_enclosure():
    xml = """<rss version='2.0'><channel><item>
      <title>Crypto market news</title>
      <link>https://example.com/crypto</link>
      <description>Crypto market news.</description>
      <enclosure
        url='https://example.com/images/crypto.png'
        type='image/png'/>
    </item></channel></rss>"""

    items = parse_rss(xml, "Example")

    assert len(items) == 1
    assert items[0]["image_url"] == "https://example.com/images/crypto.png"


def test_parse_rss_extracts_image_from_description():
    xml = """<rss version='2.0'><channel><item>
      <title>Bitcoin news</title>
      <link>https://example.com/news</link>
      <description><![CDATA[
        <p>Bitcoin market update.</p>
        <img src="https://example.com/images/news.jpg"/>
      ]]></description>
    </item></channel></rss>"""

    items = parse_rss(xml, "Example")

    assert len(items) == 1
    assert items[0]["image_url"] == "https://example.com/images/news.jpg"


def test_parse_atom_feed_extracts_image_enclosure():
    xml = """<feed xmlns='http://www.w3.org/2005/Atom'><entry>
      <title>Bitcoin market update</title>
      <link href='https://example.com/bitcoin' rel='alternate'/>
      <link
        href='https://example.com/images/bitcoin.jpg'
        rel='enclosure'
        type='image/jpeg'/>
      <summary>Bitcoin market update.</summary>
      <updated>2026-11-12T08:00:00Z</updated>
    </entry></feed>"""

    items = parse_rss(xml, "Example Atom")

    assert len(items) == 1
    assert items[0]["image_url"] == "https://example.com/images/bitcoin.jpg"


def test_parse_rss_rejects_invalid_urls_and_missing_titles():
    xml = """<rss><channel>
      <item><title>Missing link</title></item>
      <item><title>Bad link</title><link>javascript:alert(1)</link></item>
    </channel></rss>"""

    assert parse_rss(xml, "Example") == []


def test_parse_rss_rejects_invalid_image_urls():
    xml = """<rss version='2.0'><channel><item>
      <title>Bitcoin news</title>
      <link>https://example.com/news</link>
      <description><![CDATA[
        <img src="javascript:alert(1)"/>
      ]]></description>
    </item></channel></rss>"""

    items = parse_rss(xml, "Example")

    assert len(items) == 1
    assert items[0]["image_url"] is None


def test_parse_rss_handles_malformed_xml():
    assert parse_rss("<rss><item>", "Example") == []
    
