// Mock Cordova environment for local browser emulation
(function() {
    console.log('[Cordova Emulation] Initializing mock Cordova environment...');

    // In local browser emulation, use relative API requests to route through the simulator proxy
    window.API_BASE_URL = '';

    window.cordova = {
        isMock: true,
        platformId: 'browser-mock',
        version: '13.0.0',
        require: function(module) {
            console.log('[Cordova Emulation] cordova.require:', module);
            return {};
        },
        define: function(module, factory) {
            console.log('[Cordova Emulation] cordova.define:', module);
        }
    };

    // Mock StatusBar
    window.StatusBar = {
        backgroundColorByHexString: function(color) {
            console.log('[Cordova Emulation] StatusBar color set:', color);
        },
        styleLightContent: function() {},
        styleDefault: function() {},
        overlaysWebView: function(val) {}
    };

    // Mock SplashScreen
    window.navigator.splashscreen = {
        hide: function() {
            console.log('[Cordova Emulation] SplashScreen hidden');
        },
        show: function() {}
    };

    // Mock Connection
    window.Connection = {
        UNKNOWN: "unknown",
        ETHERNET: "ethernet",
        WIFI: "wifi",
        CELL_2G: "2g",
        CELL_3G: "3g",
        CELL_4G: "4g",
        CELL: "cellular",
        NONE: "none"
    };

    window.navigator.connection = {
        type: window.Connection.WIFI
    };

    // Dispatch deviceready after DOM is loaded
    function triggerDeviceReady() {
        console.log('[Cordova Emulation] Dispatching "deviceready" event...');
        const event = new CustomEvent('deviceready', {
            bubbles: true,
            cancelable: false
        });
        document.dispatchEvent(event);
        window.cordovaReadyFired = true;
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(triggerDeviceReady, 100);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(triggerDeviceReady, 100);
        });
    }
})();
