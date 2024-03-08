export var PatreonIntegrationFactory = (function(){
    class PatreonIntegration {
        isActive = false;
        alreadyChecked = false;

        constructor() {

        }

        isPatreonActive() {
            return this.isActive;
        }

        async doPatreonCheck() {
            const key = game.settings.get("D35E", "user-key");
            let postData = {}
            if (key) {
                try {
                    postData['security_code'] = key;
                    const isEnabled = await fetch(`https://legaciesofthedragon.com/api/check.php`,
                        {
                            method: 'POST',
                            body: JSON.stringify(postData),
                            headers: {
                                'Content-Type': 'application/json'
                            },
                        });
                    let response = await isEnabled.json();
                    this.isActive = true || response['has_access'];
                } catch (e) {
                    this.isActive = false;
                }
            } else {
                this.isActive = false;
            }
            this.alreadyChecked = true;
        }
    }
    var instance;
    return {
        getInstance: function(){
            if (instance == null) {
                instance = new PatreonIntegration();
                // Hide the constructor so the returned object can't be new'd...
                instance.constructor = null;
            }
            return instance;
        }
    };
})();
