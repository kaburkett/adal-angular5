import { Adal5User } from './adal5-user';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import * as adalLib from 'adal-angular';
import adal = require('adal');
import User = adal.User;


@Injectable()
export class Adal5Service {


    private adalContext: adal.AuthenticationContext;


    private adal5User: Adal5User = {
        authenticated: false,
        username: '',
        error: '',
        token: '',
        profile: {}
    };


    constructor() { }


    public init(configOptions: adal.Config) {
        if (!configOptions) {
            throw new Error('You must set config, when calling init.');
        }

        // redirect and logout_redirect are set to current location by default
        const existingHash = window.location.hash;

        let pathDefault = window.location.href;
        if (existingHash) {
            pathDefault = pathDefault.replace(existingHash, '');
        }

        configOptions.redirectUri = configOptions.redirectUri || pathDefault;
        configOptions.postLogoutRedirectUri = configOptions.postLogoutRedirectUri || pathDefault;

        // create instance with given config
        this.adalContext = adalLib.inject(configOptions);

        (window as any).AuthenticationContext = this.adalContext.constructor;

        // loginresource is used to set authenticated status
        this.updateDataFromCache(this.adalContext.config.loginResource);
    }


    public get config(): adal.Config {
        return this.adalContext.config;
    }


    public get userInfo(): Adal5User {
        return this.adal5User;
    }


    public login(): void {
        this.adalContext.login();
    }


    public loginInProgress(): boolean {
        return this.adalContext.loginInProgress();
    }


    public logOut(): void {
        this.adalContext.logOut();
    }


    public handleWindowCallback(): void {
        const hash = window.location.hash;
        if (this.adalContext.isCallback(hash)) {

            let context: adal.AuthenticationContext;

            if (this.adalContext._openedWindows.length > 0
                && this.adalContext._openedWindows[this.adalContext._openedWindows.length - 1].opener
                && this.adalContext._openedWindows[this.adalContext._openedWindows.length - 1].opener._adalInstance) {
                context = this.adalContext._openedWindows[this.adalContext._openedWindows.length - 1].opener._adalInstance;
            } else if (window.parent && window.parent['_adalInstance']) {
                context = window.parent['_adalInstance'];
            } else {
                context = this.adalContext;
            }

            const requestInfo = context.getRequestInfo(hash);

            this.adalContext.saveTokenFromHash(requestInfo);
            if (requestInfo.requestType === this.adalContext.REQUEST_TYPE.LOGIN) {
                this.updateDataFromCache(this.adalContext.config.loginResource);

            } else if (requestInfo.requestType === this.adalContext.REQUEST_TYPE.RENEW_TOKEN) {
                this.adalContext.callback = (window.parent as any).callBackMappedToRenewStates[requestInfo.stateResponse];
            }

            if (requestInfo.stateMatch) {
                if (typeof this.adalContext.callback === 'function') {
                    if (requestInfo.requestType === this.adalContext.REQUEST_TYPE.RENEW_TOKEN) {
                        // Idtoken or Accestoken can be renewed
                        if (requestInfo.parameters['access_token']) {
                            this.adalContext.callback(this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.ERROR_DESCRIPTION)
                                , requestInfo.parameters['access_token']);
                        } else if (requestInfo.parameters['id_token']) {
                            this.adalContext.callback(this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.ERROR_DESCRIPTION)
                                , requestInfo.parameters['id_token']);
                        } else if (requestInfo.parameters['error']) {
                            // tslint:disable-next-line:max-line-length
                            this.adalContext.callback(this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.ERROR_DESCRIPTION), null);
                            this.adalContext._renewFailed = true;
                        }
                    }
                }
            }
        }

        // Remove hash from url
        if (window.location.hash) {
            window.location.href = window.location.href.replace(window.location.hash, '');
        }
    }


    public getCachedToken(resource: string): string {
        return this.adalContext.getCachedToken(resource);
    }


    public acquireToken(resource: string) {
        const _this = this;   // save outer this for inner function

        let errorMessage: string;
        return Observable.bindCallback(acquireTokenInternal, function (token: string) {
            if (!token && errorMessage) {
                throw (errorMessage);
            }
            return token;
        })();

        function acquireTokenInternal(cb: any) {
            let s: string = null;

            _this.adalContext.acquireToken(resource, (error: string, tokenOut: string) => {
                if (error) {
                    _this.adalContext.error('Error when acquiring token for resource: ' + resource, error);
                    errorMessage = error;
                    cb(<string>null);
                } else {
                    cb(tokenOut);
                    s = tokenOut;
                }
            });
            return s;
        }
    }


    public getUser(): Observable<any> {
        return Observable.bindCallback((cb: (u: adal.User) => User) => {
            this.adalContext.getUser(function (error: string, user: adal.User) {
                if (error) {
                    this.adalContext.error('Error when getting user', error);
                    cb(null);
                } else {
                    cb(user);
                }
            });
        })();
    }


    public clearCache(): void {
        this.adalContext.clearCache();
    }


    public clearCacheForResource(resource: string): void {
        this.adalContext.clearCacheForResource(resource);
    }


    public info(message: string): void {
        this.adalContext.info(message);
    }


    public verbose(message: string): void {
        this.adalContext.verbose(message);
    }


    public GetResourceForEndpoint(url: string): string {
        return this.adalContext.getResourceForEndpoint(url);
    }

    public refreshDataFromCache() {
        this.updateDataFromCache(this.adalContext.config.loginResource);
    }


    private updateDataFromCache(resource: string): void {
        const token = this.adalContext.getCachedToken(resource);
        this.adal5User.authenticated = token !== null && token.length > 0;
        const user = this.adalContext.getCachedUser() || { userName: '', profile: undefined };
        if (user) {
            this.adal5User.username = user.userName;
            this.adal5User.profile = user.profile;
            this.adal5User.token = token;
            this.adal5User.error = this.adalContext.getLoginError();
        } else {
            this.adal5User.username = '';
            this.adal5User.profile = {};
            this.adal5User.token = '';
            this.adal5User.error = '';
        }
    }
}
