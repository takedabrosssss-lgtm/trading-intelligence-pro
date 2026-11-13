from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_frontend(name: str) -> str:
    return (ROOT / "frontend" / name).read_text(encoding="utf-8")


def test_quick_find_and_section_navigation_are_loaded():
    index = read_frontend("index.html")
    assert 'href="mirage-navigation.css?' in index
    assert 'src="mirage-navigation.js?' in index
    navigation = read_frontend("mirage-navigation.js")
    assert 'id="mirage41-search"' in navigation
    assert 'function drawTabs()' in navigation
    assert 'function drawSearch(query)' in navigation


def test_protocol_phantom_has_global_topbar_entry_and_guarded_handler():
    index = read_frontend("index.html")
    release = read_frontend("mirage-release.js")
    assert 'id="mirage-phantom-quick"' in index
    assert 'disabled aria-label="PROTOCOL PHANTOM"' in index
    assert '$("#mirage-phantom-quick")?.addEventListener("click"' in release
    assert 'target.click()' in release


def test_homepage_keeps_open_positions_and_recent_activity():
    index = read_frontend("index.html")
    app = read_frontend("app.js")
    assert 'id="dashboard-open-positions"' in index
    assert 'id="dashboard-recent-activity"' in index
    assert "function renderDashboardPositions(positions)" in app
    assert "function renderDashboardHistory(trades)" in app
    assert 'data-page="portfolio"' in index


def test_analytics_renders_portfolio_return_without_command_center_dependency():
    mobile = read_frontend("mirage-mobile-first.js")
    assert 'getJSON("/api/portfolio")' in mobile
    assert 'const ret = initial > 0 ? totalPnl / initial * 100 : 0;' in mobile
    assert 'getJSON("/api/mirage/command-center")' in mobile
    assert 'data-page="portfolio"' in mobile
    assert "analyticsLoading = false" in mobile


def test_stealth_palette_has_light_background_and_dark_text():
    dual = read_frontend("mirage-dual-worlds.css")
    repair = read_frontend("mirage-ui-repair.css")
    assert "--mw-bg: #f4f7f8" in dual
    assert "--mw-text: #23313a" in dual
    assert "body[data-mirage-mode=\"stealth\"] .mirage41-nav" in repair
