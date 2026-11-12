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


def test_parse_rss_rejects_invalid_urls_and_missing_titles():
    xml = """<rss><channel>
      <item><title>Missing link</title></item>
      <item><title>Bad link</title><link>javascript:alert(1)</link></item>
    </channel></rss>"""
    assert parse_rss(xml, "Example") == []


def test_parse_rss_handles_malformed_xml():
    assert parse_rss("<rss><item>", "Example") == []
