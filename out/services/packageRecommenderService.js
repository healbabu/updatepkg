"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageRecommenderService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Service for handling package recommendations from corporate service
 */
class PackageRecommenderService {
    constructor(logger, serviceUrl, timeout = 30000) {
        this.logger = logger;
        this.serviceUrl = serviceUrl;
        this.timeout = timeout;
    }
    /**
     * Get package recommendations from the corporate service
     * @param request The package recommendation request
     * @returns Array of package recommendations
     */
    async getRecommendations(request) {
        try {
            this.logger.info('Requesting package recommendations from corporate service', {
                packageName: request.packageName,
                currentVersion: request.currentVersion
            });
            const response = await axios_1.default.post(`${this.serviceUrl}/api/recommendations`, {
                ...request,
                dependencies: Object.fromEntries(request.dependencies)
            }, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!response.data || !Array.isArray(response.data)) {
                throw new Error('Invalid response format from recommendation service');
            }
            const recommendations = response.data.map(this.validateRecommendation);
            this.logger.info(`Received ${recommendations.length} recommendations from corporate service`);
            return recommendations;
        }
        catch (error) {
            this.logger.error('Failed to get package recommendations', {
                error,
                packageName: request.packageName,
                currentVersion: request.currentVersion
            });
            // Fallback to latest version if service fails
            return [{
                    packageName: request.packageName,
                    currentVersion: request.currentVersion,
                    recommendedVersion: 'latest',
                    breakingChanges: false,
                    confidence: 1.0,
                    reason: 'Fallback to latest version due to service unavailability',
                    corporatePolicy: 'fallback'
                }];
        }
    }
    /**
     * Validate and normalize a recommendation from the service
     * @param recommendation The raw recommendation from the service
     * @returns Validated package recommendation
     */
    validateRecommendation(recommendation) {
        if (!recommendation.packageName || !recommendation.currentVersion || !recommendation.recommendedVersion) {
            throw new Error('Invalid recommendation format');
        }
        return {
            packageName: recommendation.packageName,
            currentVersion: recommendation.currentVersion,
            recommendedVersion: recommendation.recommendedVersion,
            breakingChanges: recommendation.breakingChanges || false,
            confidence: recommendation.confidence || 1.0,
            reason: recommendation.reason || 'No reason provided',
            corporatePolicy: recommendation.corporatePolicy || 'default'
        };
    }
    /**
     * Log package update decision
     * @param recommendation The package recommendation
     * @param decision The decision made (approved/rejected)
     * @param reason The reason for the decision
     */
    async logUpdateDecision(recommendation, decision, reason) {
        try {
            await axios_1.default.post(`${this.serviceUrl}/api/logs`, {
                timestamp: new Date().toISOString(),
                recommendation,
                decision,
                reason
            }, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
        catch (error) {
            this.logger.error('Failed to log update decision', {
                error,
                recommendation,
                decision,
                reason
            });
        }
    }
}
exports.PackageRecommenderService = PackageRecommenderService;
//# sourceMappingURL=packageRecommenderService.js.map