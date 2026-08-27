import apiClient from "../client";

export interface CLContract {
    Id?: number;
    ClientID?: string;
    AcNo?: string;
    Hashrate?: number;
    Remark?: string;
    ContractRef?: string;
    ContractStartDate?: string;
    ContractEndDate?: string;
    Status?: number;
    hostingfee?: number;
    SLA?: number;
    CreatedOn?: string;
    CreatedBy?: number;
    Creator?: { id: number; name: string; email: string };
    ModifiedOn?: string;
    ModifiedBy?: number;
    Modifier?: { id: number; name: string; email: string };
}

export const getAllCLContracts = async (): Promise<CLContract[]> => {
    const response = await apiClient.get("/api/contracts/cl");
    return response.data;
};

export const getCLContractSummary = async (): Promise<any[]> => {
    const response = await apiClient.get("/api/contracts/cl/summary");
    return response.data;
};

export const createCLContract = async (contract: Partial<CLContract>): Promise<any> => {
    const response = await apiClient.post("/api/contracts/cl", contract);
    return response.data;
};
export const updateCLContract = async (id: number, contract: Partial<CLContract>): Promise<any> => {
    const response = await apiClient.patch(`/api/contracts/cl/${id}`, contract);
    return response.data;
};

export const deleteCLContract = async (id: number): Promise<any> => {
    const response = await apiClient.delete(`/api/contracts/cl/${id}`);
    return response.data;
};

export const setupCLDummy = async (): Promise<any> => {
    const response = await apiClient.post("/api/contracts/setup-cl-dummy");
    return response.data;
};
