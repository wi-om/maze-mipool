import apiClient from "../client";

export interface Contract {
    Id: number;
    MipContractNo: string;
    Hashrate?: number;
    HashrateUnit?: string;
    Status?: number;
    StartDate?: string;
    EndDate?: string;
    account?: {
        AcNo: string;
    };
}

export const getAllContracts = async (): Promise<Contract[]> => {
    const response = await apiClient.get("/api/contracts");
    return response.data;
};
