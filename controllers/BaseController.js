var _ = require("underscore");

module.exports = {
	name: "BaseController",

	extend: function(child) {
		return _.extend({}, this, child);
	},

	run: function(req, res, next) {

	},

	checkLogin: function(req, res, next) {
		if(!req.session.login){
            return "logouted";
        }else{
			return req.session.user.type;
        }
	},

	checkToken: async function (token){
		var payload ;
		try {
			// Parse the JWT string and store the result in `payload`.
			// Note that we are passing the key in this method as well. This method will throw an error
			// if the token is invalid (if it has expired according to the expiry time we set on sign in),
			// or if the signature does not match
			payload = jwt.verify(token, config.jwt_secret);

			let email = payload.data;

			let _select_users = await UserModel.find({email: email});

			if (_select_users.length < 1) {
				return null;
			} else {
				return _select_users[0];
			}
		} catch (e) {
			return null;
		}
	}
}